"""Deployment readiness tests for production security and isolation invariants."""

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.briefing_service import build_daily_briefing
from app.config import Settings
from app.database import SessionLocal
from app.email.digest import run_digest_scheduler_batch
from app.models import Card, Event, RawItem, Source
from app.scheduler.service import SchedulerEngine

VALID_PROD_KWARGS = {
    "ENVIRONMENT": "production",
    "SUPABASE_URL": "https://validproject.supabase.co",
    "INGEST_API_TOKEN": "prod-secret-ingest-token-12345",
    "UNSUBSCRIBE_SECRET": "prod-secret-unsubscribe-key-67890",
    "ALLOWED_ORIGINS": "https://becon.dev,https://www.becon.dev",
}


def test_production_fails_without_or_invalid_supabase_url():
    """In production, missing, empty, or invalid SUPABASE_URL must fail fast."""
    base = dict(VALID_PROD_KWARGS)

    # Empty string
    base["SUPABASE_URL"] = ""
    with pytest.raises(ValidationError, match="SUPABASE_URL must be configured"):
        Settings(**base)

    # Path appended instead of base URL
    base["SUPABASE_URL"] = "https://validproject.supabase.co/rest/v1"
    with pytest.raises(ValidationError, match="remove the path"):
        Settings(**base)


def test_production_fails_without_ingest_api_token():
    """In production, missing or blank INGEST_API_TOKEN must fail fast."""
    base = dict(VALID_PROD_KWARGS)

    base["INGEST_API_TOKEN"] = ""
    with pytest.raises(ValidationError, match="INGEST_API_TOKEN must be configured"):
        Settings(**base)

    base["INGEST_API_TOKEN"] = "   "
    with pytest.raises(ValidationError, match="INGEST_API_TOKEN must be configured"):
        Settings(**base)


def test_production_fails_without_or_default_unsubscribe_secret():
    """In production, missing or default UNSUBSCRIBE_SECRET must fail fast."""
    base = dict(VALID_PROD_KWARGS)

    base["UNSUBSCRIBE_SECRET"] = ""
    with pytest.raises(ValidationError, match="UNSUBSCRIBE_SECRET must be configured"):
        Settings(**base)

    base["UNSUBSCRIBE_SECRET"] = "dev-unsubscribe-secret-change-in-production"
    with pytest.raises(ValidationError, match="cannot use the development default"):
        Settings(**base)


def test_production_fails_without_or_insecure_allowed_origins():
    """In production, ALLOWED_ORIGINS cannot be empty, wildcard, or contain localhost."""
    base = dict(VALID_PROD_KWARGS)

    # Empty
    base["ALLOWED_ORIGINS"] = ""
    with pytest.raises(ValidationError, match="ALLOWED_ORIGINS must be configured"):
        Settings(**base)

    # Wildcard
    base["ALLOWED_ORIGINS"] = "*"
    with pytest.raises(ValidationError, match="cannot contain localhost or wildcards"):
        Settings(**base)

    # Localhost
    base["ALLOWED_ORIGINS"] = "http://localhost:3000,https://becon.dev"
    with pytest.raises(ValidationError, match="cannot contain localhost or wildcards"):
        Settings(**base)


def test_production_enable_docs_defaults_to_off():
    """In production, ENABLE_DOCS must default to False unless explicitly configured."""
    settings = Settings(**VALID_PROD_KWARGS)
    assert settings.ENABLE_DOCS is False

    # Explicit override (e.g. for staging or private docs) is still possible
    custom_kwargs = dict(VALID_PROD_KWARGS, ENABLE_DOCS=True)
    custom_settings = Settings(**custom_kwargs)
    assert custom_settings.ENABLE_DOCS is True


def test_production_serves_only_validated_cards():
    """Production briefings must strictly filter out fallback cards and non-passed cards."""
    db = SessionLocal()
    try:
        now = datetime.now(UTC)
        # 1. Setup Source
        source = Source(
            name="Test Deploy Source",
            slug=f"test-deploy-{uuid.uuid4().hex[:6]}",
            site_url="https://example.com",
            feed_url=f"https://example.com/rss-{uuid.uuid4().hex[:6]}",
            type="rss",
            enabled=True,
        )
        db.add(source)
        db.flush()

        def _make_item(title_prefix: str, model_name: str, validation_status: str) -> tuple[Event, Card]:
            ev = Event(
                id=uuid.uuid4(),
                canonical_title=f"{title_prefix} Event",
                canonical_url=f"https://example.com/events/{uuid.uuid4().hex}",
                category="release",
                severity_score=50,
                status="published",
                published_at=now,
            )
            db.add(ev)
            db.flush()

            raw = RawItem(
                id=uuid.uuid4(),
                source_id=source.id,
                event_id=ev.id,
                url=f"https://example.com/raw/{uuid.uuid4().hex}",
                url_hash=uuid.uuid4().hex,
                title=f"{title_prefix} Raw Item",
                summary="Test summary",
                status="processed",
                published_at=now,
            )
            db.add(raw)
            db.flush()

            card = Card(
                id=uuid.uuid4(),
                event_id=ev.id,
                source_url=f"https://example.com/cards/{uuid.uuid4().hex}",
                source_text_hash=uuid.uuid4().hex,
                status="published",
                validation_status=validation_status,
                model_name=model_name,
                prompt_version="1.0",
                action_type="apply",
                what_happened=["Update bullet 1", "Update bullet 2"],
                why_it_matters="Matters for engineers.",
                how_it_affects_you="Directly affects your workflow.",
                action_guidance="Apply the latest version.",
                published_at=now,
            )
            db.add(card)
            db.flush()
            return ev, card

        # A) Validated AI card (model_name="gemini-2.5-flash", validation_status="passed") -> KEEP
        ev_valid, card_valid = _make_item("Valid", "gemini-2.5-flash", "passed")
        ev_valid.severity_score = 100

        # B) Fallback card (model_name="fallback-heuristic", validation_status="passed") -> EXCLUDE
        ev_fallback, card_fallback = _make_item("Fallback", "fallback-heuristic", "passed")
        ev_fallback.severity_score = 100

        # C) Flagged AI card (model_name="gemini-2.5-flash", validation_status="flagged") -> EXCLUDE
        ev_flagged, card_flagged = _make_item("Flagged", "gemini-2.5-flash", "flagged")
        ev_flagged.severity_score = 100

        db.commit()

        # 1. Invariant: candidate card query in production strictly excludes fallback & non-passed cards
        prod_candidates = (
            db.query(Card)
            .join(Event, Card.event_id == Event.id)
            .filter(
                Card.status == "published",
                Card.model_name != "fallback-heuristic",
                Card.validation_status == "passed",
            )
            .all()
        )
        prod_candidate_ids = {str(c.id) for c in prod_candidates}
        assert str(card_valid.id) in prod_candidate_ids
        assert str(card_fallback.id) not in prod_candidate_ids
        assert str(card_flagged.id) not in prod_candidate_ids

        # 2. Daily briefing in production mode includes validated cards and never serves fallback/flagged
        cards = build_daily_briefing(db, is_production=True)
        briefing_card_ids = {str(c.id) for c in cards}
        assert str(card_fallback.id) not in briefing_card_ids
        assert str(card_flagged.id) not in briefing_card_ids
        assert str(card_valid.id) in briefing_card_ids
    finally:
        db.close()


@pytest.mark.anyio
async def test_render_services_scheduler_flags_behavior(monkeypatch):
    """Verify that SCHEDULER_ENABLED and DIGEST_SCHEDULER_ENABLED cleanly disable execution."""
    db = SessionLocal()
    try:
        # 1. SCHEDULER_ENABLED = False suppresses source scheduler cycles
        from app.config import settings
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", False)

        engine = SchedulerEngine(db_factory=lambda: db)
        results = await engine.run_due_cycle()
        assert results == []

        # 2. DIGEST_SCHEDULER_ENABLED = False suppresses email batch execution
        monkeypatch.setattr(settings, "DIGEST_SCHEDULER_ENABLED", False)
        sent_count = run_digest_scheduler_batch(db)
        assert sent_count == 0
    finally:
        db.close()
