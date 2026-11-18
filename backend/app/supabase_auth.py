"""Supabase JWT token verification module.

Supports:
1. Asymmetric path (default/standard): verifies ES256 and RS256 tokens using JWKS
   fetched from {SUPABASE_URL}/auth/v1/.well-known/jwks.json via PyJWKClient.
   Cached for 10 minutes with rate-limited single refetch per minute on unknown kid.
2. Symmetric legacy path: verifies HS256 tokens using SUPABASE_JWT_SECRET if configured.
3. Algorithm confusion protection: pinned algorithm lists per verification path;
   rejection of 'none' and mismatched signatures.
"""

import logging
import threading
import time
import uuid
from typing import Any, Dict

import httpx
import jwt
from jwt.exceptions import (
    ExpiredSignatureError,
    ImmatureSignatureError,
    InvalidAudienceError,
    InvalidIssuerError,
    InvalidSignatureError,
    InvalidTokenError,
    PyJWKClientError,
    PyJWKError,
)

from app.config import normalize_supabase_url, settings

logger = logging.getLogger("becon.auth")

# Pinned algorithms per path
ALLOWED_ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]
ALLOWED_SYMMETRIC_ALGORITHMS = ["HS256"]

# JWKS client cache and rate-limiting lock
_jwk_client: jwt.PyJWKClient | None = None
_jwk_client_url: str | None = None
_jwks_lock = threading.Lock()
_last_jwks_refetch_time: float = 0.0


class SupabaseAuthError(Exception):
    """Base exception for Supabase authentication errors."""


class SupabaseAuthNotConfiguredError(SupabaseAuthError):
    """Raised when authentication is attempted but SUPABASE_URL is not configured."""


def _get_validated_supabase_url() -> str:
    """Return normalized SUPABASE_URL root or log error and raise SupabaseAuthNotConfiguredError."""
    raw_url = (settings.SUPABASE_URL or "").strip()
    if not raw_url:
        raise SupabaseAuthNotConfiguredError("Supabase authentication is not configured on this server.")
    normalized, err = normalize_supabase_url(raw_url)
    if err or not normalized:
        logger.error(err)
        raise SupabaseAuthNotConfiguredError(f"Auth is misconfigured: {err}")
    return normalized


def get_jwk_client() -> jwt.PyJWKClient:
    """Return or initialize the cached PyJWKClient for the configured SUPABASE_URL."""
    global _jwk_client, _jwk_client_url
    base_url = _get_validated_supabase_url()
    jwks_url = f"{base_url}/auth/v1/.well-known/jwks.json"

    with _jwks_lock:
        if _jwk_client is None or _jwk_client_url != jwks_url:
            _jwk_client = jwt.PyJWKClient(
                uri=jwks_url,
                cache_keys=True,
                max_cached_keys=16,
                cache_jwk_set=True,
                lifespan=600,  # 10 minutes cache
            )
            _jwk_client_url = jwks_url
        return _jwk_client


def get_jwks_signing_key(token: str, kid: str | None) -> jwt.PyJWK:
    """Retrieve signing key from JWKS with kid-refetch rate limiting (max 1/min)."""
    global _last_jwks_refetch_time
    client = get_jwk_client()

    try:
        return client.get_signing_key_from_jwt(token)
    except (PyJWKClientError, PyJWKError) as initial_err:
        now = time.time()
        should_refetch = False
        with _jwks_lock:
            # Allow at most one refetch per minute for unknown kids
            if now - _last_jwks_refetch_time >= 60.0:
                _last_jwks_refetch_time = now
                should_refetch = True

        if should_refetch:
            try:
                # Force refresh of the JWK set from remote URL
                client.get_jwk_set(refresh=True)
                return client.get_signing_key_from_jwt(token)
            except Exception:
                pass

        raise InvalidTokenError(f"Signing key with kid '{kid}' not found or rejected.") from initial_err


def verify_supabase_token(token: str) -> Dict[str, Any]:
    """Verify and decode a Supabase JWT token.

    Validates:
    - Signature using pinned algorithm (ES256/RS256 via JWKS or HS256 via secret)
    - Algorithm confusion prevention (rejects 'none', refuses public key as HMAC secret)
    - Expiration (exp) with 10-second leeway
    - Audience (aud == SUPABASE_JWT_AUDIENCE)
    - Issuer (iss == {SUPABASE_URL}/auth/v1)
    - Subject (sub exists and is a valid UUID)

    Returns:
        Decoded claims dictionary.
    """
    if not token or not token.strip():
        raise InvalidTokenError("Empty or missing authentication token")

    token = token.strip()

    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception as e:
        raise InvalidTokenError(f"Malformed token header: {e}") from e

    alg = unverified_header.get("alg")
    if not alg or str(alg).lower() == "none":
        raise InvalidTokenError("Algorithm 'none' is explicitly prohibited")

    # Path 1: Symmetric Legacy Path (HS256)
    if alg == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise InvalidTokenError("HS256 tokens are rejected: SUPABASE_JWT_SECRET is not configured on this server.")

        expected_issuer = f"{_get_validated_supabase_url()}/auth/v1" if settings.SUPABASE_URL else None

        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=ALLOWED_SYMMETRIC_ALGORITHMS,
                audience=settings.SUPABASE_JWT_AUDIENCE,
                issuer=expected_issuer,
                leeway=10,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": True,
                    "verify_iss": bool(expected_issuer),
                    "require": ["exp", "sub", "aud"],
                },
            )
        except (ExpiredSignatureError, ImmatureSignatureError) as e:
            raise InvalidTokenError(f"Token expired or not yet valid: {e}") from e
        except (InvalidAudienceError, InvalidIssuerError) as e:
            raise InvalidTokenError(f"Token claim validation failed: {e}") from e
        except InvalidSignatureError as e:
            raise InvalidTokenError(f"Token signature verification failed: {e}") from e
        except Exception as e:
            raise InvalidTokenError(f"Token validation failed: {e}") from e

    # Path 2: Asymmetric JWKS Path (ES256, RS256)
    elif alg in ALLOWED_ASYMMETRIC_ALGORITHMS:
        base_url = _get_validated_supabase_url()

        kid = unverified_header.get("kid")
        signing_key = get_jwks_signing_key(token, kid)
        expected_issuer = f"{base_url}/auth/v1"

        try:
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=ALLOWED_ASYMMETRIC_ALGORITHMS,
                audience=settings.SUPABASE_JWT_AUDIENCE,
                issuer=expected_issuer,
                leeway=10,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": True,
                    "verify_iss": True,
                    "require": ["exp", "sub", "aud", "iss"],
                },
            )
        except (ExpiredSignatureError, ImmatureSignatureError) as e:
            raise InvalidTokenError(f"Token expired or not yet valid: {e}") from e
        except (InvalidAudienceError, InvalidIssuerError) as e:
            raise InvalidTokenError(f"Token claim validation failed: {e}") from e
        except InvalidSignatureError as e:
            raise InvalidTokenError(f"Token signature verification failed: {e}") from e
        except Exception as e:
            raise InvalidTokenError(f"Token validation failed: {e}") from e

    else:
        raise InvalidTokenError(
            f"Unsupported algorithm '{alg}'. Permitted algorithms: {ALLOWED_ASYMMETRIC_ALGORITHMS + ALLOWED_SYMMETRIC_ALGORITHMS}"
        )

    # Verify 'sub' claim is present and a valid UUID
    sub = payload.get("sub")
    if not sub:
        raise InvalidTokenError("Token is missing required 'sub' claim")
    try:
        uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise InvalidTokenError("Token 'sub' claim is not a valid UUID format")

    return payload


async def delete_supabase_user_admin(user_sub: str) -> None:
    """Call Supabase Admin API to permanently delete a user from Supabase Auth.

    Raises:
        SupabaseAuthNotConfiguredError: If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset.
        httpx.HTTPStatusError: If Supabase responds with an unexpected error.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise SupabaseAuthNotConfiguredError(
            "Account deletion is not available: Supabase service role key is not configured."
        )

    base_url = _get_validated_supabase_url()
    admin_url = f"{base_url}/auth/v1/admin/users/{user_sub}"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(admin_url, headers=headers)
        # 200, 204 = deleted; 404 = user already absent in Supabase
        if response.status_code in (200, 204, 404):
            return
        response.raise_for_status()


def log_verification_modes() -> None:
    """Log active Supabase token verification modes at startup. Never log keys."""
    modes = []
    if settings.SUPABASE_URL:
        _, url_err = normalize_supabase_url(settings.SUPABASE_URL)
        if url_err:
            logger.error(url_err)
        else:
            modes.append(f"Asymmetric JWKS ({', '.join(ALLOWED_ASYMMETRIC_ALGORITHMS)})")
    if settings.SUPABASE_JWT_SECRET:
        modes.append("Legacy Symmetric HS256")

    if modes:
        logger.info(f"Supabase Auth token verification initialized. Active modes: {', '.join(modes)}")
    else:
        logger.warning("Supabase Auth not configured (SUPABASE_URL is unset). Protected endpoints will return 503.")
