import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.ai_service import sanitize_custom_prompt
from app.config import Settings, settings
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_settings_production_fails_without_supabase_url():
    # 1. Missing / empty SUPABASE_URL in production
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", SUPABASE_URL="")

    # 2. None SUPABASE_URL in production
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", SUPABASE_URL=None)

    # 3. Valid SUPABASE_URL in production succeeds
    prod_settings = Settings(
        ENVIRONMENT="production",
        SUPABASE_URL="https://example.supabase.co",
    )
    assert prod_settings.ENVIRONMENT == "production"
    assert prod_settings.SUPABASE_URL == "https://example.supabase.co"


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
