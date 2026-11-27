"""Tests for SUPABASE_URL normalization and path validation (Task 1.6b)."""

import logging

import pytest
from pydantic import ValidationError

from app.config import SUPABASE_URL_PATH_ERROR, Settings, normalize_supabase_url, settings
from app.supabase_auth import SupabaseAuthNotConfiguredError, get_jwk_client


def test_normalize_supabase_url_cases():
    # 1. Valid project root
    url, err = normalize_supabase_url("https://myproject.supabase.co")
    assert url == "https://myproject.supabase.co"
    assert err is None

    # 2. Trailing slash -> normalized
    url, err = normalize_supabase_url("https://myproject.supabase.co/")
    assert url == "https://myproject.supabase.co"
    assert err is None

    # 3. /rest/v1 -> rejected with actionable message
    url, err = normalize_supabase_url("https://myproject.supabase.co/rest/v1")
    assert url is None
    assert err == SUPABASE_URL_PATH_ERROR

    # 4. /auth/v1 -> rejected with actionable message
    url, err = normalize_supabase_url("https://myproject.supabase.co/auth/v1")
    assert url is None
    assert err == SUPABASE_URL_PATH_ERROR

    # 5. Empty / None -> rejected
    url, err = normalize_supabase_url("")
    assert url is None
    assert err is not None
    url, err = normalize_supabase_url(None)
    assert url is None
    assert err is not None


def test_settings_production_fails_fast_on_bad_supabase_url():
    valid_prod_creds = {
        "INGEST_API_TOKEN": "valid-test-token-12345",
        "UNSUBSCRIBE_SECRET": "valid-test-secret-12345",
        "ALLOWED_ORIGINS": "https://becon.dev",
    }
    # Trailing slash in production is normalized cleanly
    ok = Settings(ENVIRONMENT="production", SUPABASE_URL="https://myproject.supabase.co/", **valid_prod_creds)
    assert ok.SUPABASE_URL == "https://myproject.supabase.co"

    # /rest/v1 fails fast at startup in production
    with pytest.raises(ValidationError, match="remove the path"):
        Settings(ENVIRONMENT="production", SUPABASE_URL="https://myproject.supabase.co/rest/v1", **valid_prod_creds)

    # /auth/v1 fails fast at startup in production
    with pytest.raises(ValidationError, match="remove the path"):
        Settings(ENVIRONMENT="production", SUPABASE_URL="https://myproject.supabase.co/auth/v1", **valid_prod_creds)

    # Empty fails fast at startup in production
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", SUPABASE_URL="", **valid_prod_creds)


def test_settings_development_logs_clear_error_and_jwk_client_rejects(monkeypatch):
    records: list[str] = []

    class _ListHandler(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())

    cfg_logger = logging.getLogger("becon.config")
    orig_disabled = cfg_logger.disabled
    cfg_logger.disabled = False
    handler = _ListHandler()
    cfg_logger.addHandler(handler)
    try:
        dev = Settings(ENVIRONMENT="development", SUPABASE_URL="https://myproject.supabase.co/rest/v1")
    finally:
        cfg_logger.removeHandler(handler)
        cfg_logger.disabled = orig_disabled

    assert any(SUPABASE_URL_PATH_ERROR in msg for msg in records)
    assert dev.SUPABASE_URL == "https://myproject.supabase.co/rest/v1"

    # Runtime JWKS lookup refuses misconfigured path with SupabaseAuthNotConfiguredError (503)
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://myproject.supabase.co/rest/v1")
    with pytest.raises(SupabaseAuthNotConfiguredError, match="Auth is misconfigured"):
        get_jwk_client()
