"""Tests for Task 4.4a: Quality-gate evaluation tooling."""

import csv
import hashlib
import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

import app.database as app_db
from app import ai_service
from app.eval_quality import (
    EVAL_CSV_COLUMNS,
    FakeEvalGeminiClient,
    evaluate_single_event,
    get_stratified_evaluation_events,
    run_eval_quality,
)
from app.models import Card, Event, EventTopic, FocusTopic, RawItem, Source
from app.rate_limit import GeminiQuotaExceededError, rate_limiter


@pytest.fixture
def db_session():
    db = app_db.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_test_source_and_event(
    db,
    source_name: str,
    category: str,
    severity: float,
    topic_name: str = "Python",
    published_days_ago: int = 1,
    content_text: str = None,
) -> Event:
    """Helper to seed an eligible event with raw item, topic, and source."""
    slug = f"src-{uuid.uuid4().hex[:8]}"
    source = Source(
        id=uuid.uuid4(),
        slug=slug,
        name=source_name,
        site_url=f"https://{slug}.com",
        feed_url=f"https://{slug}.com/feed",
        type="rss",
        enabled=True,
    )
    db.add(source)

    topic = db.query(FocusTopic).filter(FocusTopic.name == topic_name).first()
    if not topic:
        topic = FocusTopic(
            id=uuid.uuid4(),
            name=topic_name,
            slug=topic_name.lower().replace(" ", "-"),
            kind="language",
            is_active=True,
        )
        db.add(topic)
        db.flush()

    now = datetime.now(UTC)
    pub_at = now - timedelta(days=published_days_ago)

    sample_text = content_text or (
        f"{source_name} announced updates for {topic_name}. "
        f"This critical release addresses performance bottlenecks and security mitigations. "
        f"Detailed documentation and migration guides are published for production teams."
    )

    event = Event(
        id=uuid.uuid4(),
        canonical_title=f"{source_name}: Update for {topic_name}",
        canonical_url=f"https://example.com/{source_name.lower()}/update-{uuid.uuid4().hex[:6]}",
        category=category,
        severity_score=severity,
        published_at=pub_at,
        first_seen_at=pub_at,
    )
    db.add(event)
    db.flush()

    url_hash = hashlib.sha256(event.canonical_url.encode("utf-8")).hexdigest()
    content_hash = hashlib.sha256(sample_text.encode("utf-8")).hexdigest()

    raw_item = RawItem(
        id=uuid.uuid4(),
        source_id=source.id,
        event_id=event.id,
        url=event.canonical_url,
        url_hash=url_hash,
        title=event.canonical_title,
        summary=sample_text,
        content_text=sample_text,
        content_hash=content_hash,
        fetched_at=now,
    )
    db.add(raw_item)

    event_topic = EventTopic(
        id=uuid.uuid4(),
        event_id=event.id,
        topic_id=topic.id,
        confidence=0.95,
    )
    db.add(event_topic)

    db.commit()
    return event


def test_stratified_evaluation_events_selection(db_session):
    """Verifies that events are selected with category stratification and per-source capping."""
    # Seed 10 sources and events across multiple categories
    categories = ["security", "release", "deprecation", "eol", "industry"]
    created_events = []
    for i in range(12):
        cat = categories[i % len(categories)]
        ev = create_test_source_and_event(
            db_session,
            source_name=f"Source {i % 6}",  # 6 distinct sources, multiple events per source
            category=cat,
            severity=float(80 + i),
            topic_name="Python",
        )
        created_events.append(ev)

    selected = get_stratified_evaluation_events(
        db_session,
        limit=6,
        max_per_source=2,
        min_sources=3,
    )

    assert len(selected) <= 6
    assert len(selected) > 0

    # Verify per-source quota is respected
    source_counts = {}
    for ev in selected:
        raw = ev.raw_items[0]
        s_id = raw.source_id
        source_counts[s_id] = source_counts.get(s_id, 0) + 1

    for s_id, count in source_counts.items():
        assert count <= 2


def test_eval_quality_dry_run_generates_csv(db_session, tmp_path, monkeypatch):
    """Verifies that run_eval_quality with dry_run=True creates CSV with all required columns."""
    create_test_source_and_event(
        db_session,
        source_name="DryRun Security Source",
        category="security",
        severity=90.0,
        topic_name="Python",
    )
    create_test_source_and_event(
        db_session,
        source_name="DryRun Release Source",
        category="release",
        severity=85.0,
        topic_name="Rust",
    )

    out_csv = tmp_path / "test_eval_output.csv"
    exit_code = run_eval_quality(
        limit=2,
        dry_run=True,
        persist=False,
        out_dir=str(out_csv),
        db=db_session,
    )

    assert exit_code == 0
    assert os.path.exists(out_csv)

    with open(out_csv, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        assert headers == EVAL_CSV_COLUMNS

        # Check required columns including blank reviewer columns
        assert "claim_supported" in headers
        assert "invented_detail" in headers
        assert "action_sensible" in headers
        assert "notes" in headers

        rows = list(reader)
        assert len(rows) >= 1
        for row in rows:
            assert row["event_id"] != ""
            assert row["source_name"] != ""
            assert row["validator_verdict"] in ("passed", "flagged", "unvalidated")
            assert row["claim_supported"] == ""
            assert row["invented_detail"] == ""
            assert row["action_sensible"] == ""


def test_eval_quality_read_only_by_default(db_session, monkeypatch):
    """Verifies that evaluation without --persist leaves the cards table unchanged."""
    ev = create_test_source_and_event(
        db_session,
        source_name="ReadOnly Source",
        category="release",
        severity=75.0,
        topic_name="Go",
    )

    card_before = db_session.query(Card).filter(Card.event_id == ev.id).first()
    assert card_before is None

    fake_client = FakeEvalGeminiClient()
    monkeypatch.setattr(ai_service, "client", fake_client)

    result = evaluate_single_event(
        db_session,
        ev,
        dry_run=False,
        persist=False,
    )

    assert result["event_id"] == str(ev.id)
    card_after = db_session.query(Card).filter(Card.event_id == ev.id).first()
    assert card_after is None  # Must remain None when persist=False


def test_eval_quality_with_persist(db_session, monkeypatch):
    """Verifies that evaluation with --persist writes/upserts the card row."""
    ev = create_test_source_and_event(
        db_session,
        source_name="Persist Source",
        category="security",
        severity=95.0,
        topic_name="Kubernetes",
    )

    fake_client = FakeEvalGeminiClient()
    monkeypatch.setattr(ai_service, "client", fake_client)

    result = evaluate_single_event(
        db_session,
        ev,
        dry_run=False,
        persist=True,
    )

    assert result["event_id"] == str(ev.id)
    card = db_session.query(Card).filter(Card.event_id == ev.id).first()
    assert card is not None
    assert card.event_id == ev.id
    assert card.model_name == ai_service.settings.GEMINI_MODEL


def test_eval_quality_retries_used_on_initial_failure(db_session, monkeypatch):
    """Verifies that when initial synthesis fails validation, it retries once and reports retries_used == 1."""
    ev = create_test_source_and_event(
        db_session,
        source_name="Retry Source",
        category="security",
        severity=92.0,
        topic_name="Rust",
    )

    attempt = 0

    def scripted_handler(call_idx, kwargs):
        nonlocal attempt
        attempt += 1
        if attempt == 1:
            # Hallucinated version not in source
            data = {
                "what_happened": ["Rust 99.9 introduces invented syntax."],
                "why_it_matters": "Changes language semantics completely.",
                "how_it_affects_you": "Developers must rewrite all applications.",
                "what_to_do_next": {"action_type": "apply", "guidance": "Migrate codebase to Rust 99.9."},
            }
        else:
            # Grounded in source
            data = {
                "what_happened": ["Retry Source: Update for Rust announced updates."],
                "why_it_matters": "Resolves security and performance issues.",
                "how_it_affects_you": "Developers should test in staging.",
                "what_to_do_next": {"action_type": "apply", "guidance": "Review official release notes."},
            }
        return SimpleNamespace(text=json.dumps(data))

    fake_client = FakeEvalGeminiClient(handler=scripted_handler)
    monkeypatch.setattr(ai_service, "client", fake_client)

    result = evaluate_single_event(
        db_session,
        ev,
        dry_run=False,
        persist=False,
    )

    assert result["retries_used"] == 1
    assert result["validator_verdict"] == "passed"


def test_eval_quality_quota_exhaustion_writes_partial_csv_and_exits_0(db_session, tmp_path, monkeypatch):
    """On quota exhaustion, partial results are saved, message is printed, and execution exits cleanly (0)."""
    create_test_source_and_event(db_session, "Source A", "security", 90.0)
    create_test_source_and_event(db_session, "Source B", "release", 80.0)

    call_count = 0

    def mock_check_quota(user_key=None, is_guest=False):
        nonlocal call_count
        call_count += 1
        if call_count > 2:
            raise GeminiQuotaExceededError("Quota exhausted for testing", retry_after=3600)

    monkeypatch.setattr(rate_limiter, "check_gemini_quota", mock_check_quota)
    fake_client = FakeEvalGeminiClient()
    monkeypatch.setattr(ai_service, "client", fake_client)

    out_csv = tmp_path / "quota_test.csv"
    exit_code = run_eval_quality(
        limit=2,
        dry_run=False,
        persist=False,
        out_dir=str(out_csv),
        db=db_session,
    )

    assert exit_code == 0
    assert os.path.exists(out_csv)
    with open(out_csv, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        # Exactly 1 event was evaluated before quota exception on event 2
        assert len(rows) == 1
        assert rows[0]["event_id"] != ""
        assert rows[0]["validator_verdict"] == "passed"
