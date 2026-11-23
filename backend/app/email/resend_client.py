"""Resend email client with dry-run support, retry logic, and RFC 8058 headers."""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Dict, List

import httpx

from app.config import settings

logger = logging.getLogger("becon.email.resend")

RESEND_API_URL = "https://api.resend.com/emails"


@dataclass
class ResendResponse:
    id: str
    status: str
    is_dry_run: bool = False
    error: str | None = None


class ResendClient:
    """HTTP client for Resend API with automatic dry-run when RESEND_API_KEY is unset."""

    def __init__(self, api_key: str | None = None, base_url: str = RESEND_API_URL):
        self.api_key = (api_key or settings.RESEND_API_KEY or "").strip()
        self.base_url = base_url

    def send_email(
        self,
        to: str | List[str],
        subject: str,
        html_body: str,
        text_body: str,
        from_email: str | None = None,
        unsubscribe_url: str | None = None,
    ) -> ResendResponse:
        """Send an email via Resend API with retries on 5xx/429 and dry-run when key is absent."""
        to_recipients = [to] if isinstance(to, str) else list(to)
        sender = (from_email or settings.EMAIL_FROM or "Becon <digest@becon.dev>").strip()

        # Dry-run mode when API key is missing
        if not self.api_key:
            dry_id = f"dry-run-{uuid.uuid4()}"
            logger.info(
                "[Resend Dry-Run] Key unset. Would send email to %s: '%s' (id: %s)",
                to_recipients,
                subject,
                dry_id,
            )
            return ResendResponse(id=dry_id, status="sent", is_dry_run=True)

        headers: Dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # RFC 8058 Unsubscribe Headers
        extra_headers: Dict[str, str] = {}
        if unsubscribe_url:
            extra_headers["List-Unsubscribe"] = f"<{unsubscribe_url}>"
            extra_headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

        payload = {
            "from": sender,
            "to": to_recipients,
            "subject": subject,
            "html": html_body,
            "text": text_body,
        }
        if extra_headers:
            payload["headers"] = extra_headers

        max_retries = 1
        last_error = None

        with httpx.Client(timeout=10.0) as client:
            for attempt in range(1 + max_retries):
                try:
                    resp = client.post(self.base_url, headers=headers, json=payload)
                    if resp.status_code in (200, 201):
                        data = resp.json()
                        msg_id = data.get("id", str(uuid.uuid4()))
                        logger.info("Resend sent email %s to %s", msg_id, to_recipients)
                        return ResendResponse(id=msg_id, status="sent", is_dry_run=False)

                    if resp.status_code == 429 or resp.status_code >= 500:
                        logger.warning(
                            "Resend API returned status %d on attempt %d: %s",
                            resp.status_code,
                            attempt + 1,
                            resp.text[:200],
                        )
                        last_error = f"Resend API error {resp.status_code}: {resp.text[:200]}"
                        if attempt < max_retries:
                            time.sleep(0.5)
                            continue

                    # 4xx client errors (excluding 429) should fail immediately without retry
                    err_msg = f"Resend API rejected request with status {resp.status_code}: {resp.text[:300]}"
                    logger.error(err_msg)
                    return ResendResponse(id="", status="failed", is_dry_run=False, error=err_msg)

                except (httpx.TimeoutException, httpx.NetworkError) as exc:
                    logger.warning("Resend network/timeout error on attempt %d: %s", attempt + 1, exc)
                    last_error = str(exc)
                    if attempt < max_retries:
                        time.sleep(0.5)
                        continue

        return ResendResponse(
            id="",
            status="failed",
            is_dry_run=False,
            error=last_error or "Unknown failure delivering email",
        )
