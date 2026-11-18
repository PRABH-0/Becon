"""Tests for in-process rate limiting, trusted-proxy X-Forwarded-For handling, and daily Gemini quotas."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import ai_service
from app.config import settings
from app.deps import get_current_user
from app.main import app
from app.models import UserProfile
from app.rate_limit import GeminiQuotaExceededError, rate_limiter


@pytest.fixture(autouse=True)
def reset_limiter():
    rate_limiter.reset()
    yield
    rate_limiter.reset()


@pytest.fixture
def client():
    return TestClient(app)


def test_public_endpoint_rate_limit_returns_429_with_retry_after(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_PUBLIC_PER_MIN", 3)
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", "")

    for _ in range(3):
        resp = client.get("/api/topics/search", params={"q": "py"})
        assert resp.status_code == 200

    blocked = client.get("/api/topics/search", params={"q": "py"})
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert int(blocked.headers["Retry-After"]) >= 1


def test_xff_ignored_without_trusted_proxy_and_respected_behind_trusted_proxy(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_PUBLIC_PER_MIN", 2)

    # 1. TRUSTED_PROXIES unset -> spoofing X-Forwarded-For does NOT bypass limit
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", "")
    assert client.get("/api/topics/search", params={"q": "a"}, headers={"X-Forwarded-For": "1.1.1.1"}).status_code == 200
    assert client.get("/api/topics/search", params={"q": "a"}, headers={"X-Forwarded-For": "2.2.2.2"}).status_code == 200
    blocked = client.get("/api/topics/search", params={"q": "a"}, headers={"X-Forwarded-For": "3.3.3.3"})
    assert blocked.status_code == 429

    # 2. TRUSTED_PROXIES includes TestClient peer ("testclient") -> XFF separates client buckets
    rate_limiter.reset()
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", "testclient")
    assert client.get("/api/topics/search", params={"q": "a"}, headers={"X-Forwarded-For": "10.0.0.1"}).status_code == 200
    assert client.get("/api/topics/search", params={"q": "a"}, headers={"X-Forwarded-For": "10.0.0.1"}).status_code == 200
    assert client.get("/api/topics/search", params={"q": "a"}, headers={"X-Forwarded-For": "10.0.0.1"}).status_code == 429
    # Different forwarded IP still allowed
    assert client.get("/api/topics/search", params={"q": "a"}, headers={"X-Forwarded-For": "10.0.0.2"}).status_code == 200


def test_authenticated_ai_endpoint_per_user_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_AI_PER_MIN", 2)

    fake_user = UserProfile(id=9991, email="rl@example.com", name="RL User")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        payload = {"messages": [{"role": "user", "content": "Hello"}]}
        assert client.post("/api/onboarding/chat", json=payload).status_code == 200
        assert client.post("/api/onboarding/chat", json=payload).status_code == 200
        blocked = client.post("/api/onboarding/chat", json=payload)
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
        assert int(blocked.headers["Retry-After"]) >= 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_gemini_daily_caps_per_user_and_global(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_AI_PER_MIN", 100)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_PER_USER", 2)
    monkeypatch.setattr(settings, "GEMINI_DAILY_CAP_GLOBAL", 3)

    # Mock active Gemini client returning valid ChatResponse JSON
    class _FakeModels:
        def generate_content(self, **kwargs):
            return SimpleNamespace(
                text='{"reply_text": "Hi!", "onboarding_complete": false, "extracted_data": null}'
            )

    monkeypatch.setattr(ai_service, "client", SimpleNamespace(models=_FakeModels()))

    user_a = UserProfile(id=101, email="a@example.com", name="A")
    user_b = UserProfile(id=102, email="b@example.com", name="B")
    payload = {"messages": [{"role": "user", "content": "Hello"}]}

    try:
        # User A hits per-user cap (2)
        app.dependency_overrides[get_current_user] = lambda: user_a
        assert client.post("/api/onboarding/chat", json=payload).status_code == 200
        assert client.post("/api/onboarding/chat", json=payload).status_code == 200
        resp_user_cap = client.post("/api/onboarding/chat", json=payload)
        assert resp_user_cap.status_code == 429
        assert "Retry-After" in resp_user_cap.headers
        assert "daily AI request quota" in resp_user_cap.json()["detail"]

        # User B gets 1 call (reaching global cap = 3), then hits global cap
        app.dependency_overrides[get_current_user] = lambda: user_b
        assert client.post("/api/onboarding/chat", json=payload).status_code == 200
        resp_global_cap = client.post("/api/onboarding/chat", json=payload)
        assert resp_global_cap.status_code == 429
        assert "Retry-After" in resp_global_cap.headers
        assert "Global daily AI quota" in resp_global_cap.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_direct_consume_gemini_quota_raises():
    rate_limiter.reset()
    assert settings.GEMINI_DAILY_CAP_PER_USER >= 1
    assert settings.GEMINI_DAILY_CAP_GLOBAL >= 1
    # Exhaust via direct unit check
    orig = settings.GEMINI_DAILY_CAP_PER_USER
    try:
        settings.GEMINI_DAILY_CAP_PER_USER = 1
        rate_limiter.consume_gemini_quota(user_key="u1")
        with pytest.raises(GeminiQuotaExceededError) as exc_info:
            rate_limiter.consume_gemini_quota(user_key="u1")
        assert exc_info.value.retry_after >= 1
    finally:
        settings.GEMINI_DAILY_CAP_PER_USER = orig
