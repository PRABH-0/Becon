"""Email module for Becon."""

from app.email.digest import (
    build_user_digest,
    run_digest_scheduler_batch,
    send_digest_to_user,
)
from app.email.resend_client import ResendClient, ResendResponse
from app.email.signer import generate_unsubscribe_token, verify_unsubscribe_token
from app.email.templates import render_digest_html, render_digest_text

__all__ = [
    "ResendClient",
    "ResendResponse",
    "generate_unsubscribe_token",
    "verify_unsubscribe_token",
    "render_digest_html",
    "render_digest_text",
    "build_user_digest",
    "send_digest_to_user",
    "run_digest_scheduler_batch",
]
