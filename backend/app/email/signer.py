"""HMAC-SHA256 token signer for secure one-click and web unsubscribe links."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

from app.config import settings


def generate_unsubscribe_token(user_id: int, purpose: str = "unsubscribe") -> str:
    """Generate a tamper-proof HMAC-SHA256 token for user unsubscribe."""
    secret = (settings.UNSUBSCRIBE_SECRET or "dev-unsubscribe-secret-change-in-production").encode("utf-8")
    timestamp = int(time.time())
    data = f"{user_id}:{timestamp}:{purpose}".encode()
    sig = hmac.new(secret, data, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    token_str = f"{user_id}.{timestamp}.{purpose}.{sig_b64}"
    return token_str


def verify_unsubscribe_token(token: str, max_age_days: int = 180) -> int | None:
    """Verify an unsubscribe token and return the user_id if valid; else None."""
    if not token or not isinstance(token, str):
        return None
    parts = token.strip().split(".")
    if len(parts) != 4:
        return None
    user_id_str, ts_str, purpose, sig_b64 = parts
    try:
        user_id = int(user_id_str)
        timestamp = int(ts_str)
    except ValueError:
        return None

    if purpose != "unsubscribe":
        return None

    # Enforce token expiration (default 180 days)
    if time.time() - timestamp > max_age_days * 86400:
        return None

    secret = (settings.UNSUBSCRIBE_SECRET or "dev-unsubscribe-secret-change-in-production").encode("utf-8")
    data = f"{user_id}:{timestamp}:{purpose}".encode()
    expected_sig = hmac.new(secret, data, hashlib.sha256).digest()
    expected_b64 = base64.urlsafe_b64encode(expected_sig).decode("ascii").rstrip("=")

    if not hmac.compare_digest(expected_b64, sig_b64):
        return None

    return user_id


def build_unsubscribe_url(user_id: int) -> str:
    """Build the full unsubscribe URL containing the signed token."""
    base_url = (settings.APP_BASE_URL or "http://localhost:3000").rstrip("/")
    token = generate_unsubscribe_token(user_id)
    return f"{base_url}/unsubscribe?token={token}"

