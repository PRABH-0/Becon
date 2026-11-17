"""Tests for Supabase token verification, user mapping, RLS, and account deletion."""

import base64
import os
import tempfile
import time
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import jwt
import pytest
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt import PyJWK
from jwt.exceptions import InvalidTokenError
from sqlalchemy import create_engine, text

from alembic import command
from app.config import settings
from app.main import app
from app.models import Card, CardFeedback, Event, SavedCard, Source, UserFollow, UserProfile
from app.supabase_auth import (
    verify_supabase_token,
)

BACKEND_DIR = Path(__file__).resolve().parent.parent
MOCK_SUPABASE_URL = "https://mock-test-project.supabase.co"
MOCK_JWT_SECRET = "test-legacy-hs256-secret-at-least-32-chars-long"

# Generate test EC P-256 key pair once for test suite
_EC_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_EC_PUBLIC_NUMBERS = _EC_PRIVATE_KEY.public_key().public_numbers()


def _int_to_b64(val: int) -> str:
    return base64.urlsafe_b64encode(val.to_bytes(32, "big")).decode("utf-8").rstrip("=")


MOCK_JWK_DICT = {
    "kty": "EC",
    "crv": "P-256",
    "x": _int_to_b64(_EC_PUBLIC_NUMBERS.x),
    "y": _int_to_b64(_EC_PUBLIC_NUMBERS.y),
    "use": "sig",
    "alg": "ES256",
    "kid": "test-key-id-1",
}
MOCK_PYJWK = PyJWK(MOCK_JWK_DICT)


def make_es256_token(
    sub: str | None = None,
    aud: str = "authenticated",
    iss: str | None = None,
    exp: int | None = None,
    email: str | None = "dev@example.com",
    is_anonymous: bool = False,
    kid: str = "test-key-id-1",
    private_key=_EC_PRIVATE_KEY,
    app_metadata: dict | None = None,
    user_metadata: dict | None = None,
) -> str:
    now = int(time.time())
    payload = {
        "sub": sub or str(uuid.uuid4()),
        "aud": aud,
        "iss": iss or f"{MOCK_SUPABASE_URL}/auth/v1",
        "exp": exp if exp is not None else now + 3600,
        "iat": now,
        "is_anonymous": is_anonymous,
        "app_metadata": app_metadata or {"provider": "email"},
        "user_metadata": user_metadata or {"full_name": "Test User"},
    }
    if email is not None:
        payload["email"] = email
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": kid})


def make_hs256_token(
    secret: str,
    sub: str | None = None,
    aud: str = "authenticated",
    iss: str | None = None,
    exp: int | None = None,
    email: str | None = "legacy@example.com",
) -> str:
    now = int(time.time())
    payload = {
        "sub": sub or str(uuid.uuid4()),
        "aud": aud,
        "iss": iss or f"{MOCK_SUPABASE_URL}/auth/v1",
        "exp": exp if exp is not None else now + 3600,
        "iat": now,
        "email": email,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def configure_mock_supabase(monkeypatch):
    """Ensure tests run with consistent mock Supabase settings and mock JWKS key."""
    monkeypatch.setattr(settings, "SUPABASE_URL", MOCK_SUPABASE_URL)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", None)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "mock-service-role-key-backend-only")

    # Mock PyJWKClient that resolves test-key-id-1 using our generated EC key
    class MockClient:
        def get_signing_key_from_jwt(self, tok):
            headers = jwt.get_unverified_header(tok)
            if headers.get("kid") == "test-key-id-1":
                return MOCK_PYJWK
            raise jwt.exceptions.PyJWKClientError(f"Signing key with kid '{headers.get('kid')}' not found.")

        def get_jwk_set(self, refresh=False):
            return [MOCK_PYJWK]

    monkeypatch.setattr("app.supabase_auth.get_jwk_client", lambda: MockClient())


# =============================================================================
# 1. Token Verification Unit Tests (Step C / Step I)
# =============================================================================


def test_token_verification_success_es256():
    test_sub = str(uuid.uuid4())
    token = make_es256_token(sub=test_sub, email="test@becon.dev")
    payload = verify_supabase_token(token)
    assert payload["sub"] == test_sub
    assert payload["email"] == "test@becon.dev"
    assert payload["aud"] == "authenticated"


def test_token_expired():
    token = make_es256_token(exp=int(time.time()) - 100)
    with pytest.raises(InvalidTokenError, match="expired"):
        verify_supabase_token(token)


def test_token_wrong_audience():
    token = make_es256_token(aud="wrong-audience")
    with pytest.raises(InvalidTokenError, match="claim validation failed"):
        verify_supabase_token(token)


def test_token_wrong_issuer():
    token = make_es256_token(iss="https://malicious-issuer.com/auth/v1")
    with pytest.raises(InvalidTokenError, match="claim validation failed"):
        verify_supabase_token(token)


def test_token_tampered_signature():
    token = make_es256_token()
    # Tamper with signature
    parts = token.split(".")
    tampered = f"{parts[0]}.{parts[1]}.badsignature"
    with pytest.raises(InvalidTokenError):
        verify_supabase_token(tampered)


def test_token_alg_none_rejected():
    payload = {"sub": str(uuid.uuid4()), "aud": "authenticated", "iss": f"{MOCK_SUPABASE_URL}/auth/v1"}
    none_token = jwt.encode(payload, "", algorithm="none")
    with pytest.raises(InvalidTokenError, match="none"):
        verify_supabase_token(none_token)


def test_token_hs256_rejected_without_secret(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", None)
    hs_token = make_hs256_token("some-secret")
    with pytest.raises(InvalidTokenError, match="SUPABASE_JWT_SECRET is not configured"):
        verify_supabase_token(hs_token)


def test_algorithm_confusion_rejected(monkeypatch):
    """An HS256 token signed using public key bytes as HMAC secret must be rejected."""
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "actual-secret-key")
    # Attacker tries using public key bytes as HMAC secret
    pub_bytes = b"public-key-material-attacker-tries-as-hmac-secret"
    confused_token = make_hs256_token(secret=pub_bytes.decode("latin1"))
    with pytest.raises(InvalidTokenError, match="signature verification failed"):
        verify_supabase_token(confused_token)


def test_token_missing_or_invalid_sub():
    # Missing sub
    now = int(time.time())
    payload_no_sub = {
        "aud": "authenticated",
        "iss": f"{MOCK_SUPABASE_URL}/auth/v1",
        "exp": now + 3600,
    }
    t1 = jwt.encode(payload_no_sub, _EC_PRIVATE_KEY, algorithm="ES256", headers={"kid": "test-key-id-1"})
    with pytest.raises(InvalidTokenError, match="sub"):
        verify_supabase_token(t1)

    # Non-UUID sub
    payload_bad_sub = {
        "sub": "not-a-valid-uuid",
        "aud": "authenticated",
        "iss": f"{MOCK_SUPABASE_URL}/auth/v1",
        "exp": now + 3600,
    }
    t2 = jwt.encode(payload_bad_sub, _EC_PRIVATE_KEY, algorithm="ES256", headers={"kid": "test-key-id-1"})
    with pytest.raises(InvalidTokenError, match="UUID"):
        verify_supabase_token(t2)


def test_jwks_kid_spam_dos_rate_limiting(monkeypatch):
    """Verify that unknown kids trigger at most one refetch per minute."""
    import app.supabase_auth as s_auth

    refetch_count = 0

    class DummyClient:
        def get_signing_key_from_jwt(self, tok):
            raise jwt.exceptions.PyJWKClientError("kid not found")

        def get_jwk_set(self, refresh=False):
            nonlocal refetch_count
            if refresh:
                refetch_count += 1
            return []

    dummy_client = DummyClient()
    monkeypatch.setattr(s_auth, "get_jwk_client", lambda: dummy_client)
    s_auth._last_jwks_refetch_time = 0.0

    tok = make_es256_token(kid="unknown-kid-spam")

    # First attempt: triggers refetch
    with pytest.raises(InvalidTokenError):
        s_auth.get_jwks_signing_key(tok, "unknown-kid-spam")
    assert refetch_count == 1

    # Second immediate attempt: blocked by rate limiter, no second refetch
    with pytest.raises(InvalidTokenError):
        s_auth.get_jwks_signing_key(tok, "unknown-kid-spam")
    assert refetch_count == 1  # count remains 1!


def test_legacy_hs256_path_accepted_with_secret(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", MOCK_JWT_SECRET)
    hs_sub = str(uuid.uuid4())
    hs_token = make_hs256_token(secret=MOCK_JWT_SECRET, sub=hs_sub, email="legacy@becon.dev")
    payload = verify_supabase_token(hs_token)
    assert payload["sub"] == hs_sub
    assert payload["email"] == "legacy@becon.dev"


# =============================================================================
# 2. User Mapping & Endpoint Integration Tests (Steps D, G, I)
# =============================================================================


@pytest.fixture
def auth_client():
    return TestClient(app)


def test_user_mapping_first_login_creates_and_second_reuses(auth_client):
    test_sub = str(uuid.uuid4())
    token = make_es256_token(sub=test_sub, email="firstlogin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. First request creates user
    res1 = auth_client.get("/api/me", headers=headers)
    assert res1.status_code == 200, res1.text
    data1 = res1.json()
    assert data1["email"] == "firstlogin@example.com"
    assert data1["is_anonymous"] is False
    user_id_1 = data1["id"]

    # 2. Second request reuses existing user
    res2 = auth_client.get("/api/me", headers=headers)
    assert res2.status_code == 200
    assert res2.json()["id"] == user_id_1


def test_user_mapping_legacy_email_linking(auth_client):
    """Existing legacy user with NULL external_auth_id is linked to the Supabase UUID."""
    from app.database import SessionLocal

    db = SessionLocal()
    legacy_user = UserProfile(
        name="Legacy Engineer",
        email="legacy.link@example.com",
        external_auth_id=None,  # Not yet linked
        role="Systems Architect",
        interests="Kubernetes, Linux",
    )
    db.add(legacy_user)
    db.commit()
    db.refresh(legacy_user)
    legacy_id = legacy_user.id
    db.close()

    new_sub = str(uuid.uuid4())
    token = make_es256_token(sub=new_sub, email="LEGACY.LINK@EXAMPLE.COM")  # Case-insensitive
    headers = {"Authorization": f"Bearer {token}"}

    res = auth_client.get("/api/me", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["id"] == legacy_id
    assert data["email"] == "legacy.link@example.com"
    assert data["has_completed_setup"] is True


def test_user_mapping_anonymous_tokens(auth_client):
    """Anonymous tokens create rows with email=NULL and coexist without collisions."""
    anon_sub_1 = str(uuid.uuid4())
    anon_token_1 = make_es256_token(sub=anon_sub_1, email=None, is_anonymous=True)
    res1 = auth_client.get("/api/me", headers={"Authorization": f"Bearer {anon_token_1}"})
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["email"] is None
    assert d1["is_anonymous"] is True
    assert d1["email_digest_enabled"] is False

    anon_sub_2 = str(uuid.uuid4())
    anon_token_2 = make_es256_token(sub=anon_sub_2, email=None, is_anonymous=True)
    res2 = auth_client.get("/api/me", headers={"Authorization": f"Bearer {anon_token_2}"})
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["email"] is None
    assert d2["is_anonymous"] is True
    assert d1["id"] != d2["id"]


def test_user_mapping_email_conflict_returns_409(auth_client):
    """If email matches an account already bound to a DIFFERENT external_auth_id, return 409."""
    from app.database import SessionLocal

    db = SessionLocal()
    existing = UserProfile(
        name="Bound User",
        email="bound@example.com",
        external_auth_id=str(uuid.uuid4()),  # Already bound to sub A
    )
    db.add(existing)
    db.commit()
    db.close()

    # Attacker / different user logs in with sub B but same email
    sub_b = str(uuid.uuid4())
    token_b = make_es256_token(sub=sub_b, email="bound@example.com")
    res = auth_client.get("/api/me", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 409
    assert "already registered to a different identity" in res.json()["detail"]


def test_get_me_shape(auth_client):
    sub = str(uuid.uuid4())
    tok = make_es256_token(sub=sub, email="me_shape@becon.dev")
    res = auth_client.get("/api/me", headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 200
    body = res.json()
    for field in [
        "id",
        "email",
        "name",
        "picture_url",
        "is_anonymous",
        "profession",
        "timezone",
        "delivery_time",
        "email_digest_enabled",
        "has_completed_setup",
    ]:
        assert field in body, f"Missing field {field} in /api/me response"


def test_delete_account_success_and_cascades(auth_client, monkeypatch):
    """DELETE /api/account permanently deletes local row and cascades to bookmarks/follows/feedback."""
    from app.database import SessionLocal

    db = SessionLocal()
    test_sub = str(uuid.uuid4())
    user = UserProfile(name="To Delete", email="delete_me@example.com", external_auth_id=test_sub)
    source = Source(
        slug="del-source",
        name="Source",
        site_url="https://s.com",
        feed_url="https://s.com/feed",
        type="rss",
    )
    event_obj = Event(
        canonical_title="Del Event",
        canonical_url="https://s.com/e",
        category="release",
    )
    db.add_all([user, source, event_obj])
    db.commit()

    card = Card(
        event_id=event_obj.id,
        what_happened=["Point"],
        why_it_matters="Matters",
        how_it_affects_you="Affects",
        action_type="learn",
        action_guidance="Read",
        source_url="https://s.com/e",
        source_text_hash="hash",
        model_name="model",
        prompt_version="1",
    )
    db.add(card)
    db.commit()

    # Add related bookmarks, follows, feedback
    db.add(SavedCard(user_id=user.id, card_id=card.id))
    db.add(UserFollow(user_id=user.id, source_id=source.id))
    db.add(CardFeedback(user_id=user.id, card_id=card.id, value=1))
    db.commit()
    user_id = user.id
    db.close()

    # Mock Supabase Admin API call using AsyncMock
    mock_delete = AsyncMock(return_value=None)
    monkeypatch.setattr("app.main.delete_supabase_user_admin", mock_delete)

    tok = make_es256_token(sub=test_sub, email="delete_me@example.com")
    res = auth_client.delete("/api/account", headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 204

    # Verify admin API was invoked with the user sub
    mock_delete.assert_called_once_with(test_sub)

    # Verify cascades in DB
    db = SessionLocal()
    assert db.query(UserProfile).filter(UserProfile.id == user_id).first() is None
    assert db.query(SavedCard).filter(SavedCard.user_id == user_id).count() == 0
    assert db.query(UserFollow).filter(UserFollow.user_id == user_id).count() == 0
    assert db.query(CardFeedback).filter(CardFeedback.user_id == user_id).count() == 0
    db.close()


def test_delete_account_503_without_service_key(auth_client, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", None)
    tok = make_es256_token()
    res = auth_client.delete("/api/account", headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 503
    assert "service role key is not configured" in res.json()["detail"]


def test_delete_account_502_on_supabase_failure(auth_client, monkeypatch):
    """When Supabase Admin API returns an error, return 502 and retain the local row."""
    from app.database import SessionLocal

    db = SessionLocal()
    test_sub = str(uuid.uuid4())
    user = UserProfile(name="Keep Me", email="keep@example.com", external_auth_id=test_sub)
    db.add(user)
    db.commit()
    user_id = user.id
    db.close()

    async def fail_delete(sub):
        raise httpx.HTTPStatusError("Supabase Error 500", request=None, response=httpx.Response(500))

    monkeypatch.setattr("app.main.delete_supabase_user_admin", fail_delete)

    tok = make_es256_token(sub=test_sub, email="keep@example.com")
    res = auth_client.delete("/api/account", headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 502

    # Verify local user is still present
    db = SessionLocal()
    assert db.query(UserProfile).filter(UserProfile.id == user_id).first() is not None
    db.close()


def test_protected_endpoints_require_token(auth_client):
    # No token -> 401
    assert auth_client.get("/api/me").status_code == 401
    assert auth_client.get("/api/profile").status_code == 401

    # Malformed token -> 401
    assert auth_client.get("/api/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_optional_auth_endpoints(auth_client):
    # Without token -> 200
    res_anon = auth_client.get("/api/briefings?scope=top&limit=5")
    assert res_anon.status_code == 200

    # With valid token -> 200
    tok = make_es256_token(email=f"opt-{uuid.uuid4().hex[:8]}@example.com")
    res_auth = auth_client.get("/api/briefings?scope=top&limit=5", headers={"Authorization": f"Bearer {tok}"})
    assert res_auth.status_code == 200


# =============================================================================
# 3. Migration 0003 & Database Verification (Steps E, I)
# =============================================================================


def test_migration_0003_sqlite_cycle_and_null_conversion():
    """Test migration 0003: '' and legacy guest emails converted to NULL, reversible."""
    temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    temp_path = temp_file.name
    temp_file.close()
    db_url = f"sqlite:///{temp_path}"

    ini_path = BACKEND_DIR / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)

    try:
        # Upgrade to 0002
        command.upgrade(cfg, "0002")

        engine = create_engine(db_url)
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO user_profiles (id, name, email, auth_provider) VALUES (10, 'Empty User', '', 'local')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO user_profiles (id, name, email, auth_provider) "
                    "VALUES (11, 'Guest Legacy', 'guest_1234@guest.becon.local', 'guest')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO user_profiles (id, name, email, auth_provider) "
                    "VALUES (12, 'Real User', 'real@example.com', 'local')"
                )
            )

        # Run 0003
        command.upgrade(cfg, "head")

        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT id, email FROM user_profiles WHERE id IN (10, 11, 12) ORDER BY id")
            ).fetchall()
            assert rows[0][1] is None, f"Expected None for empty email, got {rows[0][1]}"
            assert rows[1][1] is None, f"Expected None for guest email, got {rows[1][1]}"
            assert rows[2][1] == "real@example.com"

        # Test downgrade
        command.downgrade(cfg, "0002")
        with engine.connect() as conn:
            downgraded_rows = conn.execute(
                text("SELECT id, email FROM user_profiles WHERE id IN (10, 11) ORDER BY id")
            ).fetchall()
            assert downgraded_rows[0][1] is not None
            assert downgraded_rows[1][1] is not None

        # Re-upgrade to head
        command.upgrade(cfg, "head")
        engine.dispose()
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@pytest.mark.skipif("TEST_DATABASE_URL" not in os.environ, reason="PostgreSQL not available locally")
def test_postgres_rls_enabled():
    """Verify Row Level Security (relrowsecurity) is enabled on all tables in PostgreSQL."""
    pg_url = os.environ["TEST_DATABASE_URL"]
    engine = create_engine(pg_url)

    expected_tables = [
        "alembic_version",
        "user_profiles",
        "saved_briefings",
        "professions",
        "focus_topics",
        "topic_aliases",
        "profession_topics",
        "user_focus_topics",
        "sources",
        "source_topics",
        "user_follows",
        "raw_items",
        "events",
        "event_topics",
        "cards",
        "card_variants",
        "saved_cards",
        "card_feedback",
        "error_reports",
        "deliveries",
        "metrics_events",
    ]

    with engine.connect() as conn:
        for tbl in expected_tables:
            query = text(f"SELECT relrowsecurity FROM pg_class WHERE relname = '{tbl}' AND relkind = 'r';")
            result = conn.execute(query).scalar()
            assert result is True, f"RLS is not enabled on table '{tbl}' in PostgreSQL"
    engine.dispose()
