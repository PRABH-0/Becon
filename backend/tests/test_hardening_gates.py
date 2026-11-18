"""Tests for gating expensive triggers (Task 1.7 item 3):
- GET /api/briefings?refresh=true requires auth + per-user rate limit
- POST /api/ai/match-topics requires auth, rate-limits per user, caps input length (500 chars)
- POST /api/ingest verifies X-Ingest-Token using hmac.compare_digest
"""

import hmac

import pytest
from fastapi.testclient import TestClient

import app.main as app_main
from app.config import settings
from app.deps import get_current_user, get_optional_user
from app.ingestion import IngestionStats
from app.main import app
from app.models import UserProfile
from app.rate_limit import rate_limiter


@pytest.fixture(autouse=True)
def reset_limiter():
    rate_limiter.reset()
    yield
    rate_limiter.reset()


@pytest.fixture
def client():
    return TestClient(app)


def test_briefings_refresh_true_requires_auth_and_rate_limits_per_user(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_AI_PER_MIN", 2)
    monkeypatch.setattr(app_main, "get_live_briefings", lambda **kwargs: [])

    # 1. Unauthenticated refresh=true -> 401
    resp_unauth = client.get("/api/briefings", params={"refresh": "true"})
    assert resp_unauth.status_code == 401

    # 2. Unauthenticated refresh=false -> 200
    resp_public = client.get("/api/briefings", params={"refresh": "false"})
    assert resp_public.status_code == 200

    # 3. Authenticated refresh=true -> succeeds up to per-user limit, then 429 + Retry-After
    fake_user = UserProfile(id=5551, email="refresh@example.com", name="Refresh User")
    app.dependency_overrides[get_optional_user] = lambda: fake_user
    try:
        assert client.get("/api/briefings", params={"refresh": "true"}).status_code == 200
        assert client.get("/api/briefings", params={"refresh": "true"}).status_code == 200
        blocked = client.get("/api/briefings", params={"refresh": "true"})
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
    finally:
        app.dependency_overrides.pop(get_optional_user, None)


def test_ai_match_topics_requires_auth_caps_length_and_rate_limits(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_AI_PER_MIN", 2)

    # 1. Unauthenticated -> 401
    resp_unauth = client.post("/api/ai/match-topics", json={"description": "Python backend"})
    assert resp_unauth.status_code == 401

    # 2. Authenticated tests
    fake_user = UserProfile(id=5552, email="match@example.com", name="Match User")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        # Input length > 500 -> 422
        resp_too_long = client.post("/api/ai/match-topics", json={"description": "x" * 501})
        assert resp_too_long.status_code == 422

        # Within limit -> 200 (2 allowed), 3rd -> 429 + Retry-After
        assert client.post("/api/ai/match-topics", json={"description": "Python"}).status_code == 200
        assert client.post("/api/ai/match-topics", json={"description": "Kubernetes"}).status_code == 200
        blocked = client.post("/api/ai/match-topics", json={"description": "Rust"})
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_ingest_uses_constant_time_hmac_compare_digest(client, monkeypatch):
    monkeypatch.setattr(settings, "INGEST_API_TOKEN", "super-secret-ingest-token")
    monkeypatch.setattr(app_main, "run_ingestion_pipeline", lambda db: IngestionStats())

    calls = []
    real_compare = hmac.compare_digest

    def spy_compare(a, b):
        calls.append((a, b))
        return real_compare(a, b)

    monkeypatch.setattr(hmac, "compare_digest", spy_compare)

    # Bad token -> 401 via compare_digest
    resp_bad = client.post("/api/ingest", headers={"X-Ingest-Token": "wrong-token"})
    assert resp_bad.status_code == 401
    assert len(calls) == 1

    # Valid token -> 200 via compare_digest
    resp_ok = client.post("/api/ingest", headers={"X-Ingest-Token": "super-secret-ingest-token"})
    assert resp_ok.status_code == 200
    assert len(calls) == 2
