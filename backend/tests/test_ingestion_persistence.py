"""Unit and integration tests for Task 1.5: Ingestion pipeline, exact dedup, and database persistence.

Tests:
1. Ingestion idempotency (running twice does not duplicate rows).
2. Exact deduplication by URL and title across sources.
3. Per-source error isolation (one failing feed does not abort the run).
4. Data survives restart and is served from the database (zero in-memory cache).
5. Card personalization and lazy variant caching in the database.
6. Public response schema validation against BriefingCard.
7. Stale-while-revalidate behavior.
8. POST /api/ingest token authentication and real counts return.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from starlette.testclient import TestClient

import app.database as app_db
from app.config import settings
from app.ingestion import (
    IngestionStats,
    get_or_create_card_variant,
    get_or_create_source,
    ingest_single_feed,
    normalize_url,
    process_raw_item_entry,
    run_ingestion_pipeline,
)
from app.main import app
from app.models import (
    Card,
    CardVariant,
    Event,
    Profession,
    RawItem,
    Source,
)
from app.schemas import BriefingCard


@pytest.fixture
def test_client():
    return TestClient(app)


@pytest.fixture
def db_session():
    session = app_db.SessionLocal()
    try:
        yield session
    finally:
        session.close()


def make_mock_feed(entries_data):
    """Helper creating a mock feedparser result."""
    mock_feed = MagicMock()
    mock_feed.bozo = 0
    mock_entries = []
    for ed in entries_data:
        entry = MagicMock()
        entry.get.side_effect = lambda k, default=None, ed=ed: ed.get(k, default)
        entry.__getitem__.side_effect = lambda k, ed=ed: ed[k]
        entry.__contains__.side_effect = lambda k, ed=ed: k in ed
        mock_entries.append(entry)
    mock_feed.entries = mock_entries
    return mock_feed


def test_url_normalization():
    """Verify URL normalization strips tracking queries and fragments."""
    raw = "https://Example.COM/posts/release-1.0/?utm_source=twitter&utm_medium=social&ref=123#heading"
    normalized = normalize_url(raw)
    assert normalized == "https://example.com/posts/release-1.0"


def test_ingestion_idempotency(db_session, monkeypatch):
    """Verify re-running ingestion does not create duplicate rows."""
    sample_entries = [
        {
            "title": "TypeScript 5.8 Beta Announced",
            "link": "https://devblogs.microsoft.com/typescript/typescript-5-8-beta",
            "summary": "TypeScript 5.8 Beta is now available with new type checking optimizations.",
            "published_at": "Feb 10, 2026",
        },
        {
            "title": "React 19 Server Actions Guide",
            "link": "https://react.dev/blog/2026/02/server-actions",
            "summary": "Detailed architectural breakdown of modern Server Actions.",
            "published_at": "Feb 12, 2026",
        },
    ]

    mock_feed = make_mock_feed(sample_entries)
    monkeypatch.setattr("feedparser.parse", lambda *args, **kwargs: mock_feed)

    source = get_or_create_source(db_session, "https://mock.feed/rss.xml", "Mock Feed")
    stats1 = IngestionStats()

    # Run 1: initial ingestion
    for entry in sample_entries:
        process_raw_item_entry(db_session, source, entry, "TypeScript", stats1)
    db_session.commit()

    assert stats1.raw_items_new == 2
    assert stats1.raw_items_duplicate == 0
    assert stats1.events_created == 2
    assert stats1.cards_created == 2

    raw_count_1 = db_session.query(RawItem).filter(RawItem.source_id == source.id).count()
    event_count_1 = db_session.query(Event).count()
    card_count_1 = db_session.query(Card).count()

    # Run 2: re-ingest identical entries
    stats2 = IngestionStats()
    for entry in sample_entries:
        process_raw_item_entry(db_session, source, entry, "TypeScript", stats2)
    db_session.commit()

    assert stats2.raw_items_new == 0
    assert stats2.raw_items_duplicate == 2
    assert stats2.events_created == 0
    assert stats2.cards_created == 0

    raw_count_2 = db_session.query(RawItem).filter(RawItem.source_id == source.id).count()
    event_count_2 = db_session.query(Event).count()
    card_count_2 = db_session.query(Card).count()

    assert raw_count_1 == raw_count_2
    assert event_count_1 == event_count_2
    assert card_count_1 == card_count_2


def test_exact_dedup_by_url_and_title(db_session):
    """Verify items with identical URL or identical title collapse into a single event."""
    source_a = get_or_create_source(db_session, "https://feed-a.org/rss", "Source A")
    source_b = get_or_create_source(db_session, "https://feed-b.org/rss", "Source B")
    source_c = get_or_create_source(db_session, "https://feed-c.org/rss", "Source C")

    unique_url = f"https://example.com/unique-post-{datetime.now().timestamp()}"
    unique_title = f"PostgreSQL 18 Features Overview {datetime.now().timestamp()}"

    # Item 1 from Source A
    stats_a = IngestionStats()
    process_raw_item_entry(
        db_session,
        source_a,
        {"title": unique_title, "link": unique_url, "summary": "Initial summary"},
        "PostgreSQL",
        stats_a,
    )
    db_session.commit()
    assert stats_a.events_created == 1
    assert stats_a.cards_created == 1

    # Item 2 from Source B with SAME URL but different tracking query
    stats_b = IngestionStats()
    process_raw_item_entry(
        db_session,
        source_b,
        {
            "title": "Different Title on Aggregator",
            "link": f"{unique_url}?utm_source=rss",
            "summary": "Aggregated summary",
        },
        "PostgreSQL",
        stats_b,
    )
    db_session.commit()
    assert stats_b.raw_items_new == 1
    assert stats_b.events_created == 0  # Collapsed into existing event!

    # Item 3 from Source C with DIFFERENT URL but exact SAME title
    stats_c = IngestionStats()
    process_raw_item_entry(
        db_session,
        source_c,
        {
            "title": unique_title,
            "link": f"https://mirror.com/article-{datetime.now().timestamp()}",
            "summary": "Mirror copy",
        },
        "PostgreSQL",
        stats_c,
    )
    db_session.commit()
    assert stats_c.raw_items_new == 1
    assert stats_c.events_created == 0  # Collapsed into existing event by title!


def test_per_source_error_isolation(db_session, monkeypatch):
    """Verify a failing feed does not abort ingestion of other healthy feeds."""
    failing_url = "https://failing-source.com/rss"
    healthy_url = "https://healthy-source.com/rss"

    def mock_parse(url, *args, **kwargs):
        if url == failing_url:
            raise ConnectionError("Simulated DNS failure or socket timeout")
        return make_mock_feed(
            [
                {
                    "title": "Healthy Feed Update",
                    "link": "https://healthy-source.com/update-1",
                    "summary": "Healthy feed content description",
                }
            ]
        )

    monkeypatch.setattr("feedparser.parse", mock_parse)

    stats = IngestionStats()
    ingest_single_feed(db_session, "Failing Topic", failing_url, stats)
    ingest_single_feed(db_session, "Healthy Topic", healthy_url, stats)

    assert stats.errors == 1
    assert stats.sources_fetched == 1
    assert stats.cards_created >= 1

    failing_source = db_session.query(Source).filter(Source.feed_url == failing_url).first()
    assert failing_source is not None
    assert "DNS failure" in failing_source.last_error
    assert failing_source.consecutive_failures == 1

    healthy_source = db_session.query(Source).filter(Source.feed_url == healthy_url).first()
    assert healthy_source is not None
    assert healthy_source.last_error is None
    assert healthy_source.last_success_at is not None


def test_briefings_persisted_across_restarts(test_client, db_session, monkeypatch):
    """Verify briefings are served from the database and survive fresh client requests."""
    unique_marker = f"UniqueEngineUpdate-{datetime.now().timestamp()}"
    sample_feed = make_mock_feed(
        [
            {
                "title": f"Production Advisory {unique_marker}",
                "link": f"https://advisory.becon.dev/{unique_marker}",
                "summary": "Critical production architectural note. This advisory outlines key performance implications, system vulnerability mitigations, and upgrade instructions across all operational deployment clusters.",
            }
        ]
    )
    monkeypatch.setattr("feedparser.parse", lambda *a, **kw: sample_feed)

    # Ingest once
    run_ingestion_pipeline(db=db_session, user_interests="Python", limit_per_source=2)

    # Simulate Request 1
    resp1 = test_client.get("/api/briefings?scope=top&limit=5")
    assert resp1.status_code == 200
    cards1 = resp1.json()
    assert len(cards1) > 0
    first_id = cards1[0]["id"]

    # Simulate Request 2 with fresh client
    fresh_client = TestClient(app)
    resp2 = fresh_client.get("/api/briefings?scope=top&limit=5")
    assert resp2.status_code == 200
    cards2 = resp2.json()
    assert cards2[0]["id"] == first_id


def test_card_personalization_and_variant_caching(db_session, monkeypatch):
    """Verify known professions receive cached variants and unknown roles fall back without creating Profession rows."""
    import app.ingestion as ing

    # Ensure two known Profession rows exist (never auto-created from free text)
    for slug, name in [
        ("frontend-developer", "Frontend Developer"),
        ("cloud-security-architect", "Cloud Security Architect"),
    ]:
        if not db_session.query(Profession).filter(Profession.slug == slug).first():
            db_session.add(Profession(slug=slug, name=name, is_active=True))
    db_session.commit()

    # Ensure a card exists
    card = db_session.query(Card).first()
    if not card:
        source = get_or_create_source(db_session, "https://test.feed/rss", "Test Feed")
        process_raw_item_entry(
            db_session,
            source,
            {
                "title": "Kernel Memory Architecture",
                "link": "https://kernel.org/memory",
                "summary": "Low-level memory management changes.",
            },
            "Linux",
            IngestionStats(),
        )
        db_session.commit()
        card = db_session.query(Card).first()

    prof_count_before = db_session.query(Profession).count()

    # Request variant for known role (by name)
    v1_how, v1_type, v1_guidance = get_or_create_card_variant(
        db_session, card, user_role="Frontend Developer"
    )

    # Request variant for known role (by slug)
    v2_how, v2_type, v2_guidance = get_or_create_card_variant(
        db_session, card, user_role="cloud-security-architect"
    )

    assert "Frontend Developer" in v1_how or "Frontend" in v1_guidance
    assert "Cloud Security Architect" in v2_how or "Cloud" in v2_guidance
    assert db_session.query(Profession).count() == prof_count_before

    # Spy on generate_action_card to prove caching & zero AI calls for unknown roles
    spy_generator = MagicMock(side_effect=ing.generate_action_card)
    monkeypatch.setattr(ing, "generate_action_card", spy_generator)

    # Request Frontend Developer variant again -> cached
    v1_cached_how, _, _ = get_or_create_card_variant(
        db_session, card, user_role="Frontend Developer"
    )
    assert v1_cached_how == v1_how
    assert spy_generator.call_count == 0  # Zero AI calls! Served from DB variant row!

    # Unknown free-text role -> falls back to generic card text, creates ZERO Profession rows, 0 AI calls
    variants_before = db_session.query(CardVariant).count()
    unknown_how, unknown_type, unknown_guidance = get_or_create_card_variant(
        db_session, card, user_role="Arbitrary Unseeded Role XYZ 999"
    )
    assert unknown_how == card.how_it_affects_you
    assert unknown_type == card.action_type
    assert unknown_guidance == card.action_guidance
    assert db_session.query(Profession).count() == prof_count_before
    assert db_session.query(CardVariant).count() == variants_before
    assert spy_generator.call_count == 0


def test_briefing_card_schema_conformance(test_client):
    """Verify that every card returned by /api/briefings conforms to the BriefingCard schema."""
    resp = test_client.get("/api/briefings?scope=top&limit=5")
    assert resp.status_code == 200
    data = resp.json()

    for item in data:
        card = BriefingCard.model_validate(item)
        assert card.title
        assert card.source_url
        assert card.card_content.what_happened
        assert card.card_content.why_it_matters
        assert card.card_content.how_it_affects_you
        assert card.card_content.what_to_do_next.action_type in ("learn", "apply", "avoid", "prepare")
        assert card.card_content.what_to_do_next.guidance


def test_stale_while_revalidate_flow(test_client, db_session, monkeypatch):
    """Verify stale data is returned immediately while background re-ingestion schedules only for authenticated non-guests."""
    from app.deps import get_optional_user
    from app.models import UserProfile

    # Ensure all existing cards are older than TTL (30 minutes)
    db_session.query(Card).update({Card.created_at: datetime.now(UTC) - timedelta(minutes=45)})
    db_session.commit()

    scheduled_tasks = []

    def mock_add_task(self, func, *args, **kwargs):
        scheduled_tasks.append((func, args, kwargs))

    monkeypatch.setattr("fastapi.BackgroundTasks.add_task", mock_add_task)

    # Unauthenticated caller -> returns persisted cards, schedules 0 background tasks
    resp_anon = test_client.get("/api/briefings?scope=top&limit=5")
    assert resp_anon.status_code == 200
    assert len(resp_anon.json()) > 0
    assert len(scheduled_tasks) == 0

    # Authenticated non-guest caller -> schedules background refresh
    fake_user = UserProfile(id=7701, email="swr@example.com", name="SWR User", is_anonymous=False)
    app.dependency_overrides[get_optional_user] = lambda: fake_user
    try:
        resp_auth = test_client.get("/api/briefings?scope=top&limit=5")
        assert resp_auth.status_code == 200
        assert len(resp_auth.json()) > 0
        assert len(scheduled_tasks) >= 1
    finally:
        app.dependency_overrides.pop(get_optional_user, None)


def test_ingest_token_auth_and_real_counts(test_client, monkeypatch):
    """Verify POST /api/ingest security and real counts payload."""
    monkeypatch.setattr(settings, "INGEST_API_TOKEN", "super-secret-token")

    # Missing token -> 401
    r_missing = test_client.post("/api/ingest")
    assert r_missing.status_code == 401

    # Wrong token -> 401
    r_wrong = test_client.post("/api/ingest", headers={"X-Ingest-Token": "bad-token"})
    assert r_wrong.status_code == 401

    # Mock feedparser to return predictable entries
    mock_feed = make_mock_feed(
        [
            {
                "title": f"Live Ingest Test {datetime.now().timestamp()}",
                "link": f"https://test.becon.dev/ingest-{datetime.now().timestamp()}",
                "summary": "Live ingest content summary",
            }
        ]
    )
    monkeypatch.setattr("feedparser.parse", lambda *a, **kw: mock_feed)

    # Valid token -> 200 with real counts
    r_valid = test_client.post("/api/ingest", headers={"X-Ingest-Token": "super-secret-token"})
    assert r_valid.status_code == 200
    payload = r_valid.json()
    assert payload["status"] == "success"
    assert "sources_fetched" in payload
    assert "raw_items_new" in payload
    assert "raw_items_duplicate" in payload
    assert "events_created" in payload
    assert "cards_created" in payload
    assert "errors" in payload
    assert payload["sources_fetched"] > 0
