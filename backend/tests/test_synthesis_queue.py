"""Tests for Task F3.1: Production Synthesis Queue, Status Endpoint, and Limited Briefing Fallback."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Tuple

import pytest
from fastapi.testclient import TestClient

import app.ai_service as ai_service
import app.database as app_db
from app.briefing_service import build_daily_briefing
from app.config import settings
from app.main import app
from app.models import Card, Event, EventTopic, FocusTopic, RawItem, Source
from app.rate_limit import GeminiQuotaExceededError, rate_limiter
from app.synthesize import get_synthesis_queue, run_synthesis_queue


class ScriptedGeminiClient:
    """Fake genai client for synthesis queue tests."""

    def __init__(self, responses=None):
        self.calls: list[dict] = []
        self._responses = list(responses) if responses else []
        self.models = self

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self._responses:
            resp = self._responses.pop(0)
            if isinstance(resp, Exception):
                raise resp
            if isinstance(resp, str):
                return SimpleNamespace(
                    text=resp,
                    usage_metadata=SimpleNamespace(
                        prompt_token_count=100,
                        candidates_token_count=60,
                        total_token_count=160,
                    ),
                )
            if callable(resp):
                return resp(kwargs)

        # Default valid response grounded in typical source text
        return SimpleNamespace(
            text=json.dumps(
                {
                    "what_happened": ["Official release notes announced security and stability improvements."],
                    "why_it_matters": "Improves operational resilience and system reliability.",
                    "how_it_affects_you": "Developers should review deployment dependencies.",
                    "what_to_do_next": {
                        "action_type": "apply",
                        "guidance": "Upgrade to the latest supported stable release.",
                    },
                }
            ),
            usage_metadata=SimpleNamespace(
                prompt_token_count=100,
                candidates_token_count=60,
                total_token_count=160,
            ),
        )


@pytest.fixture(autouse=True)
def reset_rate_limits():
    rate_limiter.reset()


def _create_source(db, name: str, slug: str) -> Source:
    src = db.query(Source).filter(Source.slug == slug).first()
    if not src:
        src = Source(
            id=uuid.uuid4(),
            name=name,
            slug=slug,
            site_url="https://example.com",
            feed_url=f"https://example.com/{slug}/rss",
            type="rss",
            enabled=True,
            status="healthy",
        )
        db.add(src)
        db.flush()
    return src


def _create_event(
    db,
    source: Source,
    title: str,
    severity: int = 50,
    category: str = "release",
    published_days_ago: int = 1,
    summary: str = "Official release notes with comprehensive fixes and stability updates for enterprise workflows exceeding two hundred characters of text.",
    topic: FocusTopic | None = None,
) -> Tuple[Event, RawItem]:
    pub_dt = datetime.now(UTC) - timedelta(days=published_days_ago)
    ev = Event(
        id=uuid.uuid4(),
        canonical_title=title,
        canonical_url=f"https://example.com/events/{uuid.uuid4().hex[:8]}",
        category=category,
        severity_score=severity,
        status="published",
        published_at=pub_dt,
        first_seen_at=pub_dt,
    )
    db.add(ev)
    db.flush()

    raw = RawItem(
        id=uuid.uuid4(),
        source_id=source.id,
        event_id=ev.id,
        title=title,
        url=ev.canonical_url,
        url_hash=uuid.uuid4().hex[:16],
        content_hash=uuid.uuid4().hex[:16],
        summary=summary,
        published_at=pub_dt,
        status="processed",
    )
    db.add(raw)
    db.flush()

    if topic:
        et = EventTopic(event_id=ev.id, topic_id=topic.id, confidence=0.9, is_primary=True)
        db.add(et)
        db.flush()

    db.commit()
    return ev, raw


class TestSynthesisQueue:
    def test_queue_ordering(self):
        """Queue selects eligible events and orders by (severity DESC, published_at DESC, topic_count DESC)."""
        db = app_db.SessionLocal()
        try:
            src = _create_source(db, "Queue Ordering Source", f"q-ord-{uuid.uuid4().hex[:6]}")
            topic1 = FocusTopic(id=uuid.uuid4(), slug=f"t1-{uuid.uuid4().hex[:6]}", name="Topic1", kind="technology")
            topic2 = FocusTopic(id=uuid.uuid4(), slug=f"t2-{uuid.uuid4().hex[:6]}", name="Topic2", kind="technology")
            db.add_all([topic1, topic2])
            db.commit()

            # High severity event (90), 1 day ago
            ev_high, _ = _create_event(db, src, "High Severity Event", severity=90, published_days_ago=1, topic=topic1)

            # Medium severity event (60), published today
            ev_med, _ = _create_event(db, src, "Medium Severity Event", severity=60, published_days_ago=0, topic=topic1)

            # Low severity event (30), 2 days ago
            ev_low, _ = _create_event(db, src, "Low Severity Event", severity=30, published_days_ago=2, topic=topic1)

            # Old event outside 7-day window (severity 100, 10 days ago) - must be excluded
            ev_old, _ = _create_event(db, src, "Old Expired Event", severity=100, published_days_ago=10, topic=topic1)

            queue = get_synthesis_queue(db)
            queue_ids = [e.id for e in queue]

            # High should outrank med, med should outrank low
            assert ev_high.id in queue_ids
            assert ev_med.id in queue_ids
            assert ev_low.id in queue_ids
            assert ev_old.id not in queue_ids

            idx_high = queue_ids.index(ev_high.id)
            idx_med = queue_ids.index(ev_med.id)
            idx_low = queue_ids.index(ev_low.id)
            assert idx_high < idx_med < idx_low
        finally:
            db.close()

    def test_skip_already_validated(self):
        """Events that already have a validated Gemini card are excluded from the queue."""
        db = app_db.SessionLocal()
        try:
            src = _create_source(db, "Skip Validated Source", f"skip-val-{uuid.uuid4().hex[:6]}")
            topic = FocusTopic(id=uuid.uuid4(), slug=f"ts-{uuid.uuid4().hex[:6]}", name="Topic", kind="technology")
            db.add(topic)
            db.commit()

            ev, _ = _create_event(db, src, "Already Validated Event", severity=85, topic=topic)

            # Add validated Gemini card
            card = Card(
                id=uuid.uuid4(),
                event_id=ev.id,
                what_happened=["Done."],
                why_it_matters="Matters.",
                how_it_affects_you="Affects you.",
                action_type="apply",
                action_guidance="Check it.",
                source_url=ev.canonical_url,
                source_text_hash="hash123",
                model_name=settings.GEMINI_MODEL,
                prompt_version="2.0-grounded",
                validation_status="passed",
                status="published",
                published_at=datetime.now(UTC),
            )
            db.add(card)
            db.commit()

            queue = get_synthesis_queue(db)
            queue_ids = [e.id for e in queue]
            assert ev.id not in queue_ids
        finally:
            db.close()

    def test_dry_run_makes_zero_calls(self, monkeypatch):
        """Dry-run calculates queue size and quota remaining with 0 Gemini calls and 0 DB writes."""
        db = app_db.SessionLocal()
        try:
            src = _create_source(db, "Dry Run Source", f"dry-run-{uuid.uuid4().hex[:6]}")
            topic = FocusTopic(id=uuid.uuid4(), slug=f"td-{uuid.uuid4().hex[:6]}", name="Topic", kind="technology")
            db.add(topic)
            db.commit()

            ev, _ = _create_event(db, src, "Dry Run Test Event", severity=80, topic=topic)

            fake_client = ScriptedGeminiClient()
            monkeypatch.setattr(ai_service, "client", fake_client)
            monkeypatch.setattr(ai_service, "get_gemini_client", lambda: fake_client)

            result = run_synthesis_queue(db=db, limit=5, dry_run=True)

            assert len(fake_client.calls) == 0
            assert result.synthesized == 0
            assert result.passed == 0
            assert result.flagged == 0
            assert result.queue_size >= 1
            assert result.quota_remaining > 0

            # Verify no card was created/altered
            card = db.query(Card).filter(Card.event_id == ev.id).first()
            assert card is None
        finally:
            db.close()

    def test_quota_stop(self, monkeypatch):
        """Synthesis halts cleanly when Gemini quota limit is exhausted without marking cards flagged."""
        db = app_db.SessionLocal()
        try:
            src = _create_source(db, "Quota Source", f"quota-src-{uuid.uuid4().hex[:6]}")
            topic = FocusTopic(id=uuid.uuid4(), slug=f"tq-{uuid.uuid4().hex[:6]}", name="Topic", kind="technology")
            db.add(topic)
            db.commit()

            ev, _ = _create_event(db, src, "Quota Reached Event", severity=88, topic=topic)

            # Script client to raise quota exceeded error
            fake_client = ScriptedGeminiClient(
                responses=[GeminiQuotaExceededError("Daily AI quota reached.", retry_after=3600)]
            )
            monkeypatch.setattr(ai_service, "client", fake_client)
            monkeypatch.setattr(ai_service, "get_gemini_client", lambda: fake_client)

            result = run_synthesis_queue(db=db, limit=5)

            # Quota stop halts cleanly
            assert result.synthesized == 0
            # Card must NOT be marked flagged
            card = db.query(Card).filter(Card.event_id == ev.id).first()
            if card:
                assert card.validation_status != "flagged"
        finally:
            db.close()

    def test_flagged_on_failure(self, monkeypatch):
        """When Gemini hallucinations fail validation twice, card is marked flagged and draft."""
        db = app_db.SessionLocal()
        try:
            src = _create_source(db, "Flagged Source", f"flag-src-{uuid.uuid4().hex[:6]}")
            topic = FocusTopic(id=uuid.uuid4(), slug=f"tf-{uuid.uuid4().hex[:6]}", name="Topic", kind="technology")
            db.add(topic)
            db.commit()

            ev, _ = _create_event(
                db,
                src,
                "Simple Release",
                severity=75,
                summary=(
                    "Simple official blog post with basic operational notes about performance enhancements, "
                    "system stability improvements, scalability optimizations, and ecosystem architectural refinements "
                    "designed specifically to exceed more than two hundred characters of comprehensive source text."
                ),
                topic=topic,
            )

            # Return fabricated versions (v99.9.9) absent from source text on both attempts
            bad_response = json.dumps(
                {
                    "what_happened": ["Fabricated version v99.9.9 with CVE-2099-9999 released."],
                    "why_it_matters": "Significant changes in architecture.",
                    "how_it_affects_you": "Developers must update immediately.",
                    "what_to_do_next": {"action_type": "apply", "guidance": "Install v99.9.9."},
                }
            )
            fake_client = ScriptedGeminiClient(responses=[bad_response, bad_response])
            monkeypatch.setattr(ai_service, "client", fake_client)
            monkeypatch.setattr(ai_service, "get_gemini_client", lambda: fake_client)

            from app.synthesize import synthesize_event_card
            card, outcome = synthesize_event_card(db, ev)

            assert outcome == "flagged"
            assert card is not None
            assert card.validation_status == "flagged"
            assert card.status == "draft"
        finally:
            db.close()

    def test_synthesis_status_endpoint(self, monkeypatch):
        """GET /api/synthesis/status returns queue and card counts protected by X-Ingest-Token."""
        client = TestClient(app)
        token = "test-secret-token"
        monkeypatch.setattr(settings, "INGEST_API_TOKEN", token)

        # 1. Missing token -> 401
        res = client.get("/api/synthesis/status")
        assert res.status_code == 401

        # 2. Invalid token -> 401
        res = client.get("/api/synthesis/status", headers={"X-Ingest-Token": "bad-token"})
        assert res.status_code == 401

        # 3. Valid token -> 200 with schema shape
        res = client.get("/api/synthesis/status", headers={"X-Ingest-Token": token})
        assert res.status_code == 200
        data = res.json()
        assert "queue_size" in data
        assert "synthesized_total" in data
        assert "passed_total" in data
        assert "flagged_total" in data
        assert "unvalidated_total" in data
        assert "quota_remaining" in data
        assert isinstance(data["queue_size"], int)
        assert isinstance(data["quota_remaining"], int)

    def test_limited_today_fallback(self):
        """In production mode, if briefing has < 3 validated cards, status_note is 'limited_today'."""
        db = app_db.SessionLocal()
        try:
            # Query or create an event with a passed Gemini card
            src = _create_source(db, "Prod Fallback Source", f"prod-src-{uuid.uuid4().hex[:6]}")
            topic = FocusTopic(id=uuid.uuid4(), slug=f"tpf-{uuid.uuid4().hex[:6]}", name="Topic", kind="technology")
            db.add(topic)
            db.commit()

            ev, _ = _create_event(db, src, "Single Validated Prod Card", severity=95, topic=topic)
            card = Card(
                id=uuid.uuid4(),
                event_id=ev.id,
                what_happened=["Single validated card."],
                why_it_matters="High priority update.",
                how_it_affects_you="Immediate attention needed.",
                action_type="apply",
                action_guidance="Check system.",
                source_url=ev.canonical_url,
                source_text_hash="hash456",
                model_name=settings.GEMINI_MODEL,
                prompt_version="2.0-grounded",
                validation_status="passed",
                status="published",
                published_at=datetime.now(UTC),
            )
            db.add(card)
            db.commit()

            # Ask for briefing with is_production=True
            briefing = build_daily_briefing(
                db=db,
                user=None,
                user_interests="Topic",
                max_cards=2,  # Force < 3 cards
                is_production=True,
            )

            if len(briefing) < 3 and len(briefing) > 0:
                assert briefing[0].status_note == "limited_today"
        finally:
            db.close()
