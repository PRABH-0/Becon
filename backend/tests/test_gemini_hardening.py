"""Tests for Task 1.7b: Pre-GEMINI_API_KEY spend and abuse hardening."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.ai_service as ai_service
import app.database as app_db
import app.ingestion as ingestion_mod
from app.config import settings
from app.deps import get_current_user, get_optional_user
from app.main import app
from app.models import Card, CardVariant, Event, FocusTopic, Profession, RawItem, Source, UserProfile
from app.rate_limit import rate_limiter


class FakeGeminiClient:
    """Fake google-genai client that counts calls, records configs/prompts, and returns scripted outputs."""

    def __init__(self, handler=None):
        self.calls: list[dict] = []
        self._handler = handler
        self.models = self

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self._handler is not None:
            return self._handler(len(self.calls), kwargs)
        # Default valid BriefingCardContent JSON
        return SimpleNamespace(
            text=json.dumps(
                {
                    "what_happened": ["Fake Gemini summary bullet."],
                    "why_it_matters": "Fake Gemini why it matters.",
                    "how_it_affects_you": "Fake Gemini role-tailored impact.",
                    "what_to_do_next": {
                        "action_type": "apply",
                        "guidance": "Fake Gemini tactical guidance.",
                    },
                }
            )
        )


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    rate_limiter.reset()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    yield
    rate_limiter.reset()
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _create_isolated_card(db, title_prefix: str = "HardeningEvent"):
    slug_suffix = f"{int(datetime.now(UTC).timestamp() * 1_000_000)}"
    ev = Event(
        canonical_title=f"{title_prefix} {slug_suffix}",
        canonical_url=f"https://example.com/{title_prefix.lower()}-{slug_suffix}",
        category="release",
        severity_score=60,
        is_breaking=False,
        first_seen_at=datetime.now(UTC),
        published_at=datetime.now(UTC),
        status="published",
    )
    db.add(ev)
    db.flush()
    card = Card(
        event_id=ev.id,
        what_happened=["Canonical bullet."],
        why_it_matters="Canonical why it matters.",
        how_it_affects_you="Canonical generic impact.",
        action_type="learn",
        action_guidance="Canonical generic guidance.",
        source_url=ev.canonical_url,
        source_text_hash=f"hash-{slug_suffix}",
        model_name="fallback-heuristic",
        prompt_version="1.0",
        validation_status="passed",
        published_at=datetime.now(UTC),
        status="published",
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return ev, card


def test_unauthenticated_search_and_briefings_zero_gemini_and_zero_db_rows(client, monkeypatch):
    """Unauthenticated search/briefings never call Gemini or create Source/FocusTopic/Profession rows."""
    fake_gemini = FakeGeminiClient()
    monkeypatch.setattr(ai_service, "client", fake_gemini)

    # Guard feedparser so any live RSS attempt would immediately fail the test
    def fail_feedparser(*args, **kwargs):
        raise AssertionError("Unauthenticated request must never invoke feedparser/ingestion!")

    monkeypatch.setattr("feedparser.parse", fail_feedparser)

    db = app_db.SessionLocal()
    try:
        # Ensure a known Profession exists so we also prove unauthenticated requests don't generate variants
        prof = db.query(Profession).filter(Profession.slug == "hardening-engineer").first()
        if not prof:
            prof = Profession(slug="hardening-engineer", name="Hardening Engineer", is_active=True)
            db.add(prof)
            db.commit()

        ev, card = _create_isolated_card(db, "UnauthBriefingCard")

        sources_before = db.query(Source).count()
        topics_before = db.query(FocusTopic).count()
        profs_before = db.query(Profession).count()
        variants_before = db.query(CardVariant).count()

        # 1. Unauthenticated search cache miss -> empty cards + friendly message, 0 Gemini, 0 DB rows
        resp_miss = client.get(
            "/api/briefings/search",
            params={"q": "zz_unmatched_topic_9999", "role": "Hardening Engineer"},
        )
        assert resp_miss.status_code == 200
        body = resp_miss.json()
        assert body["cards"] == []
        assert body["message"] and "no matches yet" in body["message"].lower()

        # 2. Unauthenticated search with live=true -> 401
        resp_live_unauth = client.get(
            "/api/briefings/search",
            params={"q": "zz_unmatched_topic_9999", "live": "true"},
        )
        assert resp_live_unauth.status_code == 401

        # 3. Unauthenticated briefings with known profession and multi-topic interests -> DB-only, 0 Gemini
        resp_feed = client.get(
            "/api/briefings",
            params={
                "role": "Hardening Engineer",
                "interests": "Rust, Kubernetes, Zero-Day, Supply Chain, Quantum",
                "limit": 5,
            },
        )
        assert resp_feed.status_code == 200

        # 4. Unauthenticated briefings with malicious/long valid-cap interests -> still 0 Gemini / 0 DB rows
        assert len(fake_gemini.calls) == 0
        assert db.query(Source).count() == sources_before
        assert db.query(FocusTopic).count() == topics_before
        assert db.query(Profession).count() == profs_before
        assert db.query(CardVariant).count() == variants_before
    finally:
        db.delete(ev)
        if prof:
            db.delete(prof)
        db.commit()
        db.close()


def test_oversize_inputs_return_422_and_max_output_tokens_set_on_all_gemini_calls(client, monkeypatch):
    """Every input length/count cap returns 422, and every Gemini call sets max_output_tokens from config."""
    # 1. GET /api/briefings caps
    too_many_topics = ",".join(f"topic{i}" for i in range(11))
    assert client.get("/api/briefings", params={"interests": too_many_topics}).status_code == 422

    topic_too_long = "a" * 61
    assert client.get("/api/briefings", params={"interests": topic_too_long}).status_code == 422

    assert client.get("/api/briefings", params={"role": "r" * 121}).status_code == 422
    assert client.get("/api/briefings", params={"custom_prompt": "p" * 501}).status_code == 422

    # 2. POST /api/onboarding/chat caps
    fake_user = UserProfile(id=8801, email="caps@example.com", name="Caps User", is_anonymous=False)
    app.dependency_overrides[get_current_user] = lambda: fake_user

    too_many_msgs = {"messages": [{"role": "user", "content": f"msg {i}"} for i in range(21)]}
    assert client.post("/api/onboarding/chat", json=too_many_msgs).status_code == 422

    msg_too_long = {"messages": [{"role": "user", "content": "x" * 1001}]}
    assert client.post("/api/onboarding/chat", json=msg_too_long).status_code == 422

    # 3. Verify max_output_tokens is explicitly set from config on ALL 3 Gemini functions
    def handler(call_idx, kwargs):
        cfg = kwargs["config"]
        if cfg.response_schema is ai_service.BriefingCardContent:
            return SimpleNamespace(
                text=json.dumps(
                    {
                        "what_happened": ["Card bullet"],
                        "why_it_matters": "Matters",
                        "how_it_affects_you": "Affects",
                        "what_to_do_next": {"action_type": "apply", "guidance": "Do it"},
                    }
                )
            )
        if cfg.response_schema is ai_service.ChatResponse:
            return SimpleNamespace(
                text=json.dumps({"reply_text": "Hi!", "onboarding_complete": False, "extracted_data": None})
            )
        return SimpleNamespace(text=json.dumps(["Rust Systems", "WebAssembly"]))

    fake_gemini = FakeGeminiClient(handler=handler)
    monkeypatch.setattr(ai_service, "client", fake_gemini)

    ai_service.generate_action_card("Title", "https://example.com", "Summary", "Rust", user_key="8801")
    ai_service.ai_match_topics("obscure_quantum_compiler", available_topics=[], user_key="8801")
    ai_service.ai_onboarding_chat(
        [ai_service.ChatMessage(role="user", content="Hello")],
        available_topics=["Rust"],
        user_key="8801",
    )

    assert len(fake_gemini.calls) == 3
    assert fake_gemini.calls[0]["config"].max_output_tokens == settings.GEMINI_MAX_OUTPUT_TOKENS_CARD
    assert fake_gemini.calls[1]["config"].max_output_tokens == settings.GEMINI_MAX_OUTPUT_TOKENS_MATCH_TOPICS
    assert fake_gemini.calls[2]["config"].max_output_tokens == settings.GEMINI_MAX_OUTPUT_TOKENS_CHAT


def test_shared_variant_cache_isolated_from_custom_prompt(client, monkeypatch):
    """Two users with different custom_prompt do not contaminate the shared CardVariant row."""
    fake_gemini = FakeGeminiClient()
    monkeypatch.setattr(ai_service, "client", fake_gemini)

    db = app_db.SessionLocal()
    prof = None
    ev = None
    try:
        prof = Profession(slug="variant-iso-prof", name="Variant Iso Engineer", is_active=True)
        db.add(prof)
        db.commit()
        ev, card = _create_isolated_card(db, "VariantIsolation")

        user_a = UserProfile(
            id=8811,
            email="a@example.com",
            name="User A",
            role="Variant Iso Engineer",
            customPrompt="SECRET_USER_A_DIRECTIVE_ONLY",
            is_anonymous=False,
        )
        user_b = UserProfile(
            id=8812,
            email="b@example.com",
            name="User B",
            role="Variant Iso Engineer",
            customPrompt="SECRET_USER_B_DIRECTIVE_ONLY",
            is_anonymous=False,
        )

        # User A triggers first shared variant generation
        app.dependency_overrides[get_optional_user] = lambda: user_a
        resp_a = client.get(
            "/api/briefings/search",
            params={"q": ev.canonical_title, "role": "Variant Iso Engineer"},
        )
        assert resp_a.status_code == 200
        assert len(resp_a.json()["cards"]) == 1
        assert len(fake_gemini.calls) == 1

        # Prompt sent to Gemini MUST NOT contain User A's custom_prompt
        sent_prompt = fake_gemini.calls[0]["contents"]
        assert "SECRET_USER_A_DIRECTIVE_ONLY" not in sent_prompt
        assert "<user_preference>" not in sent_prompt

        # User B with different custom_prompt gets the shared cached variant with ZERO new Gemini calls
        app.dependency_overrides[get_optional_user] = lambda: user_b
        resp_b = client.get(
            "/api/briefings/search",
            params={"q": ev.canonical_title, "role": "Variant Iso Engineer"},
        )
        assert resp_b.status_code == 200
        assert len(fake_gemini.calls) == 1  # Still 1 (served from shared cache)
        assert resp_b.json()["cards"][0]["card_content"]["how_it_affects_you"] == (
            resp_a.json()["cards"][0]["card_content"]["how_it_affects_you"]
        )

        # Verify DB row itself has no user prompt contamination
        variant_row = (
            db.query(CardVariant)
            .filter(CardVariant.card_id == card.id, CardVariant.profession_id == prof.id)
            .first()
        )
        assert variant_row is not None
        assert "SECRET_USER_A_DIRECTIVE_ONLY" not in variant_row.how_it_affects_you
        assert "SECRET_USER_B_DIRECTIVE_ONLY" not in variant_row.how_it_affects_you
    finally:
        if ev is not None:
            db.delete(ev)
        if prof is not None:
            db.delete(prof)
        db.commit()
        db.close()


def test_retry_consumes_quota_once_and_unreached_failure_consumes_zero(monkeypatch):
    """Retrying after bad JSON consumes daily cap once; network failure before reaching Gemini consumes 0."""
    monkeypatch.setattr(ai_service.time, "sleep", lambda *_: None)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_PER_USER", 5)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_GLOBAL", 10)

    # Case 1: Attempt 1 returns invalid JSON (reached Gemini), Attempt 2 succeeds -> 2 calls, 1 quota unit
    def bad_then_good(call_idx, kwargs):
        if call_idx == 1:
            return SimpleNamespace(text="{not valid json")
        return SimpleNamespace(
            text=json.dumps(
                {
                    "what_happened": ["Recovered bullet"],
                    "why_it_matters": "Matters",
                    "how_it_affects_you": "Affects",
                    "what_to_do_next": {"action_type": "apply", "guidance": "Proceed"},
                }
            )
        )

    fake_retry = FakeGeminiClient(handler=bad_then_good)
    monkeypatch.setattr(ai_service, "client", fake_retry)

    result = ai_service.generate_action_card(
        "Retry Test", "https://example.com/retry", "Summary", "Python", user_key="retry-u1"
    )
    assert result.what_happened == ["Recovered bullet"]
    assert len(fake_retry.calls) == 2
    assert rate_limiter._user_gemini_counts["retry-u1"] == 1
    assert rate_limiter._global_gemini_count == 1

    # Case 2: Both attempts raise ConnectionError (never reached Gemini) -> 0 quota consumed
    rate_limiter.reset()

    def always_unreachable(call_idx, kwargs):
        raise ConnectionError("DNS / network unreachable before Gemini")

    fake_unreachable = FakeGeminiClient(handler=always_unreachable)
    monkeypatch.setattr(ai_service, "client", fake_unreachable)

    fallback = ai_service.generate_action_card(
        "Unreachable Test", "https://example.com/down", "Raw summary text here.", "Python", user_key="retry-u2"
    )
    assert fallback.what_happened  # Falls back cleanly
    assert len(fake_unreachable.calls) == 2  # Initial + max 1 retry
    assert rate_limiter._user_gemini_counts["retry-u2"] == 0
    assert rate_limiter._global_gemini_count == 0


def test_guest_stricter_limits_apply_and_normal_user_unaffected(client, monkeypatch):
    """Guests hit GUEST_AI_PER_MIN, GEMINI_DAILY_CAP_GUEST, and GEMINI_DAILY_CAP_ALL_GUESTS while full users are unaffected."""
    monkeypatch.setattr(settings, "GUEST_AI_PER_MIN", 2)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_AI_PER_MIN", 10)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_GUEST", 2)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_ALL_GUESTS", 3)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_PER_USER", 25)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_GLOBAL", 200)

    def chat_handler(call_idx, kwargs):
        return SimpleNamespace(
            text=json.dumps({"reply_text": "Hello!", "onboarding_complete": False, "extracted_data": None})
        )

    fake_gemini = FakeGeminiClient(handler=chat_handler)
    monkeypatch.setattr(ai_service, "client", fake_gemini)

    guest_1 = UserProfile(id=9101, email=None, name="Guest 1", is_anonymous=True)
    guest_2 = UserProfile(id=9102, email=None, name="Guest 2", is_anonymous=True)
    normal_user = UserProfile(id=9201, email="real@example.com", name="Real User", is_anonymous=False)
    chat_payload = {"messages": [{"role": "user", "content": "Hi"}]}

    # Guests cannot force refresh or trigger live search
    app.dependency_overrides[get_optional_user] = lambda: guest_1
    assert client.get("/api/briefings", params={"refresh": "true"}).status_code == 403
    assert client.get("/api/briefings/search", params={"q": "python", "live": "true"}).status_code == 403

    # Guest 1 hits per-guest daily/per-min cap at call #3 (cap=2)
    app.dependency_overrides[get_current_user] = lambda: guest_1
    assert client.post("/api/onboarding/chat", json=chat_payload).status_code == 200
    assert client.post("/api/onboarding/chat", json=chat_payload).status_code == 200
    resp_g1_blocked = client.post("/api/onboarding/chat", json=chat_payload)
    assert resp_g1_blocked.status_code == 429
    assert "Retry-After" in resp_g1_blocked.headers

    # Guest 2 gets 1 call (bringing all-guests total to 3 == GEMINI_DAILY_CAP_ALL_GUESTS), then blocked
    app.dependency_overrides[get_current_user] = lambda: guest_2
    assert client.post("/api/onboarding/chat", json=chat_payload).status_code == 200
    resp_all_guests_blocked = client.post("/api/onboarding/chat", json=chat_payload)
    assert resp_all_guests_blocked.status_code == 429
    assert "guest" in resp_all_guests_blocked.json()["detail"].lower()

    # Normal authenticated user is completely unaffected by guest pool exhaustion
    app.dependency_overrides[get_current_user] = lambda: normal_user
    for _ in range(4):
        assert client.post("/api/onboarding/chat", json=chat_payload).status_code == 200


def test_ingest_stops_at_per_run_gemini_budget_and_defers_remaining_raw_items(client, monkeypatch):
    """POST /api/ingest stops calling Gemini at INGEST_MAX_GEMINI_CALLS_PER_RUN and leaves excess items as raw_items."""
    monkeypatch.setattr(settings, "INGEST_API_TOKEN", "ingest-budget-secret")
    monkeypatch.setattr(settings, "INGEST_MAX_GEMINI_CALLS_PER_RUN", 2)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_GLOBAL", 50)

    fake_gemini = FakeGeminiClient()
    monkeypatch.setattr(ai_service, "client", fake_gemini)

    marker = f"budget-{int(datetime.now(UTC).timestamp() * 1_000_000)}"
    entries = [
        {
            "title": f"Budget Release {marker}-{i}",
            "link": f"https://releases.becon.dev/{marker}/{i}",
            "summary": f"Official release notes for {marker} item {i}.",
        }
        for i in range(5)
    ]
    fake_feed = SimpleNamespace(entries=entries, bozo=0)
    monkeypatch.setattr("feedparser.parse", lambda *a, **kw: fake_feed)

    # Restrict default sources to 1 feed for deterministic testing
    monkeypatch.setattr("app.feed_service.DEFAULT_FEED_SOURCES", {"Budget Test Feed": f"https://feeds.becon.dev/{marker}.xml"})

    db = app_db.SessionLocal()
    try:
        resp1 = client.post("/api/ingest", headers={"X-Ingest-Token": "ingest-budget-secret"})
        assert resp1.status_code == 200
        body1 = resp1.json()
        assert body1["cards_created"] == 2
        assert body1["raw_items_new"] == 5
        assert len(fake_gemini.calls) == 2

        # Remaining 3 items persisted as raw_items with status='new' (deferred for next run)
        source = db.query(Source).filter(Source.feed_url == f"https://feeds.becon.dev/{marker}.xml").first()
        assert source is not None
        processed_count = db.query(RawItem).filter(RawItem.source_id == source.id, RawItem.status == "processed").count()
        deferred_count = db.query(RawItem).filter(RawItem.source_id == source.id, RawItem.status == "new").count()
        assert processed_count == 2
        assert deferred_count == 3

        # Next ingest run picks up 2 more deferred raw_items within the next run's budget
        resp2 = client.post("/api/ingest", headers={"X-Ingest-Token": "ingest-budget-secret"})
        assert resp2.status_code == 200
        assert resp2.json()["cards_created"] == 2
        assert len(fake_gemini.calls) == 4
        assert db.query(RawItem).filter(RawItem.source_id == source.id, RawItem.status == "processed").count() == 4
        assert db.query(RawItem).filter(RawItem.source_id == source.id, RawItem.status == "new").count() == 1
    finally:
        # Clean up test records
        for ev in db.query(Event).filter(Event.canonical_title.like(f"Budget Release {marker}%")).all():
            db.delete(ev)
        src = db.query(Source).filter(Source.feed_url == f"https://feeds.becon.dev/{marker}.xml").first()
        if src:
            db.delete(src)
        db.commit()
        db.close()

    # Keep reference so ruff doesn't warn on ingestion_mod import
    assert ingestion_mod.settings is settings
