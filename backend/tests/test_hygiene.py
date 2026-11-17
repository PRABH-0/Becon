from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from pydantic import ValidationError

from app.ai_service import sanitize_custom_prompt
from app.auth import ALGORITHM, create_access_token
from app.config import Settings, settings
from app.main import _guest_ip_log, app


@pytest.fixture
def client():
    return TestClient(app)


def test_settings_production_fails_without_secure_key():
    # 1. Missing / empty SECRET_KEY in production
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", SECRET_KEY="")

    # 2. Known insecure default dev keys in production
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", SECRET_KEY="dev-secret-key-change-in-production")

    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", SECRET_KEY="dev-only-change-me")

    # 3. Short secret key in production (< 16 chars)
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", SECRET_KEY="short-key")

    # 4. Valid secret key in production succeeds
    prod_settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="a-very-secure-random-production-key-12345",
    )
    assert prod_settings.ENVIRONMENT == "production"


def test_create_access_token_default_expiry_is_seven_days():
    token = create_access_token({"sub": "user@example.com"})
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])

    exp = payload.get("exp")
    assert exp is not None

    now_ts = datetime.now(UTC).timestamp()
    diff_seconds = exp - now_ts

    # Expected ~ 7 days (60 * 24 * 7 * 60 = 604800 seconds)
    expected_seconds = 7 * 24 * 3600
    assert abs(diff_seconds - expected_seconds) < 60


def test_sanitize_custom_prompt():
    raw_dirty = "Hello\x00World\x1fwith\x7fcontrol characters\t!"
    cleaned = sanitize_custom_prompt(raw_dirty)
    assert "\x00" not in cleaned
    assert "\x1f" not in cleaned
    assert "\x7f" not in cleaned
    assert "Hello World with control characters !" == cleaned

    # Length truncation
    long_prompt = "A" * 700
    truncated = sanitize_custom_prompt(long_prompt)
    assert len(truncated) == 500


def test_ingest_endpoint_token_protection(client, monkeypatch):
    # 1. When INGEST_API_TOKEN is unset / empty -> returns 503
    monkeypatch.setattr(settings, "INGEST_API_TOKEN", "")
    resp = client.post("/api/ingest")
    assert resp.status_code == 503

    # 2. When INGEST_API_TOKEN is set, but request has no token or wrong token -> returns 401
    monkeypatch.setattr(settings, "INGEST_API_TOKEN", "valid-test-ingest-token")
    resp_no_token = client.post("/api/ingest")
    assert resp_no_token.status_code == 401

    resp_wrong_token = client.post(
        "/api/ingest",
        headers={"X-Ingest-Token": "wrong-token"},
    )
    assert resp_wrong_token.status_code == 401

    # 3. When INGEST_API_TOKEN is set and correct token is provided -> returns 200
    resp_valid = client.post(
        "/api/ingest",
        headers={"X-Ingest-Token": "valid-test-ingest-token"},
    )
    assert resp_valid.status_code == 200
    assert resp_valid.json()["status"] == "processing"


def test_guest_rate_limiting(client, monkeypatch):
    _guest_ip_log.clear()
    monkeypatch.setattr(settings, "GUEST_RATE_LIMIT_PER_HOUR", 5)

    headers = {"X-Forwarded-For": "192.168.1.100"}

    # 5 attempts within limit should all succeed
    for i in range(5):
        resp = client.post("/api/auth/guest", headers=headers)
        assert resp.status_code == 200, f"Attempt {i + 1} failed"
        assert "access_token" in resp.json()

    # 6th attempt should be blocked with 429
    resp_blocked = client.post("/api/auth/guest", headers=headers)
    assert resp_blocked.status_code == 429
    assert "Too many guest accounts" in resp_blocked.json()["detail"]

    # Different IP should succeed
    diff_ip_headers = {"X-Forwarded-For": "192.168.1.200"}
    resp_diff_ip = client.post("/api/auth/guest", headers=diff_ip_headers)
    assert resp_diff_ip.status_code == 200
