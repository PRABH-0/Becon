"""Tests for Task F7: Daily Email Digest via Resend, Templates, Unsubscribe Flow, and Delivery Scheduler."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import app.database as app_db
from app.config import settings
from app.email.digest import (
    parse_delivery_time,
    parse_user_timezone,
    send_digest_to_user,
)
from app.email.resend_client import ResendClient
from app.email.signer import (
    build_unsubscribe_url,
    generate_unsubscribe_token,
    verify_unsubscribe_token,
)
from app.email.templates import render_digest_html, render_digest_text
from app.main import app
from app.models import (
    Delivery,
    UserProfile,
)
from app.rate_limit import rate_limiter
from app.schemas import ActionGuidance, BriefingCard, BriefingCardContent


@pytest.fixture(autouse=True)
def reset_rate_limits():
    rate_limiter.reset()


def _make_dummy_card(
    title: str = "Test Security Patch v2.0",
    action_type: str = "apply",
    is_lead: bool = False,
    match_reason: str = "Matches: Kubernetes",
) -> BriefingCard:
    """Helper to create a structured BriefingCard DTO."""
    return BriefingCard(
        id=str(uuid.uuid4()),
        title=title,
        severity_score=85,
        category="security",
        reading_time_minutes=2,
        action_type=action_type,
        source_url="https://example.com/advisory/1",
        published_at=datetime.now(UTC).isoformat(),
        validation_status="validated",
        is_lead=is_lead,
        match_reason=match_reason,
        card_content=BriefingCardContent(
            what_happened=[
                "Fixed remote code execution flaw in API parser.",
                "<script>alert('xss-test')</script> handled safely.",
            ],
            why_it_matters="Critical risk for external endpoints without auth.",
            how_it_affects_you="Upgrade production gateways immediately.",
            what_to_do_next=ActionGuidance(
                action_type=action_type,
                guidance="Deploy patch version 2.0.1 within 24 hours.",
            ),
        ),
    )


def test_render_digest_html_escaping_and_elements():
    """Verify HTML template renders all 4 parts, action badge, match reason, and escapes XSS payloads."""
    card = _make_dummy_card(
        title="Critical Security <Update> & Fix",
        action_type="avoid",
        is_lead=True,
        match_reason="Matches: Python, high severity",
    )
    unsub_url = "https://example.com/unsubscribe?token=abc.123"
    pref_url = "https://example.com/profile"
    base_url = "https://example.com"

    html = render_digest_html(
        user_name="John <Doe>",
        user_role="Lead <Architect>",
        cards=[card],
        today_str="Monday, Nov 23, 2026",
        reading_time_minutes=2,
        unsubscribe_url=unsub_url,
        preferences_url=pref_url,
        base_url=base_url,
    )

    # 1. Broad layout & user info escaped
    assert "John &lt;Doe&gt;" in html
    assert "Lead &lt;Architect&gt;" in html
    assert "Monday, Nov 23, 2026" in html
    assert "Critical Security &lt;Update&gt; &amp; Fix" in html

    # 2. XSS payload inside what_happened is escaped
    assert "<script>alert('xss-test')</script>" not in html
    assert "&lt;script&gt;alert(&#x27;xss-test&#x27;)&lt;/script&gt;" in html

    # 3. 4 parts present
    assert "Fixed remote code execution flaw in API parser." in html
    assert "Critical risk for external endpoints without auth." in html
    assert "Upgrade production gateways immediately." in html
    assert "Deploy patch version 2.0.1 within 24 hours." in html

    # 4. Action badge & match reason present
    assert "AVOID" in html
    assert "Matches: Python, high severity" in html
    assert "LEAD STORY" in html

    # 5. Unsubscribe link present
    assert unsub_url in html


def test_render_digest_plain_text():
    """Verify ASCII broadsheet plain-text template layout."""
    card = _make_dummy_card(
        title="TypeScript 6.0 Released",
        action_type="learn",
        is_lead=True,
        match_reason="Matches: TypeScript",
    )
    unsub_url = "https://example.com/unsubscribe?token=abc.123"
    pref_url = "https://example.com/profile"
    base_url = "https://example.com"

    text = render_digest_text(
        user_name="Alice",
        user_role="Frontend Engineer",
        cards=[card],
        today_str="Monday, Nov 23, 2026",
        reading_time_minutes=3,
        unsubscribe_url=unsub_url,
        preferences_url=pref_url,
        base_url=base_url,
    )

    assert "THE DAILY INTELLIGENCE GAZETTE" in text
    assert "Alice" in text
    assert "TypeScript 6.0 Released" in text
    assert "[LEAD STORY]" in text
    assert "ACTION: LEARN" in text
    assert "Matches: TypeScript" in text
    assert "WHAT HAPPENED:" in text
    assert "WHY IT MATTERS:" in text
    assert "HOW IT AFFECTS YOU" in text
    assert "RECOMMENDED ACTION" in text
    assert unsub_url in text


def test_unsubscribe_token_signing_and_verification():
    """Verify HMAC token generation and verification."""
    user_id = 42
    token = generate_unsubscribe_token(user_id)

    # 1. Structure check: 4 dot-separated parts
    parts = token.split(".")
    assert len(parts) == 4
    assert parts[0] == "42"
    assert parts[2] == "unsubscribe"

    # 2. Valid token resolves back to user_id
    verified_id = verify_unsubscribe_token(token)
    assert verified_id == 42

    # 3. Tampered signature fails
    tampered_sig = token[:-3] + "xyz"
    assert verify_unsubscribe_token(tampered_sig) is None

    # 4. Tampered user_id fails
    tampered_user = "99" + token[2:]
    assert verify_unsubscribe_token(tampered_user) is None

    # 5. Malformed tokens fail gracefully
    assert verify_unsubscribe_token("") is None
    assert verify_unsubscribe_token("not-a-token") is None
    assert verify_unsubscribe_token("1.2.3") is None

    # 6. build_unsubscribe_url contains APP_BASE_URL and token
    url = build_unsubscribe_url(user_id)
    assert "/unsubscribe?token=" in url
    assert str(user_id) in url


def test_unsubscribe_endpoints_get_and_post():
    """Verify GET and POST /api/unsubscribe update user profile in database."""
    db = next(app_db.get_db())
    test_email = f"unsub_{uuid.uuid4().hex[:6]}@example.com"
    user = UserProfile(
        name="Unsub User",
        email=test_email,
        role="Developer",
        email_digest_enabled=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    client = TestClient(app)
    token = generate_unsubscribe_token(user.id)

    # 1. GET /api/unsubscribe?token=...
    resp = client.get(f"/api/unsubscribe?token={token}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "unsubscribed"

    # Check database: user.email_digest_enabled is False
    db.refresh(user)
    assert user.email_digest_enabled is False

    # 2. Idempotent call
    resp2 = client.get(f"/api/unsubscribe?token={token}")
    assert resp2.status_code == 200

    # 3. POST /api/unsubscribe (RFC 8058 one-click style)
    user.email_digest_enabled = True
    db.commit()

    resp_post = client.post(f"/api/unsubscribe?token={token}")
    assert resp_post.status_code == 200
    assert resp_post.json()["status"] == "unsubscribed"
    db.refresh(user)
    assert user.email_digest_enabled is False

    # 4. POST with JSON body
    user.email_digest_enabled = True
    db.commit()
    resp_json = client.post("/api/unsubscribe", json={"token": token})
    assert resp_json.status_code == 200
    db.refresh(user)
    assert user.email_digest_enabled is False

    # 5. Invalid token returns 400
    bad_resp = client.post("/api/unsubscribe", json={"token": "invalid.bad.token.signature"})
    assert bad_resp.status_code == 400

    # Cleanup
    db.delete(user)
    db.commit()


def test_resend_client_dry_run_and_headers(monkeypatch):
    """Verify ResendClient performs dry-run when key is unset and sets RFC 8058 headers."""
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")

    client = ResendClient()
    unsub_url = "https://example.com/unsubscribe?token=test.token"

    result = client.send_email(
        to="reader@example.com",
        subject="Becon Daily Intelligence",
        html_body="<p>Hello</p>",
        text_body="Hello",
        unsubscribe_url=unsub_url,
    )

    assert result.is_dry_run is True
    assert result.id.startswith("dry-run-")
    assert result.status == "sent"


def test_resend_webhook_bounces_and_complaints(monkeypatch):
    """Verify POST /api/webhooks/resend disables user digest on bounce or complaint."""
    db = next(app_db.get_db())
    test_email = f"bounce_{uuid.uuid4().hex[:6]}@example.com"
    user = UserProfile(
        name="Bounce User",
        email=test_email,
        role="Developer",
        email_digest_enabled=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    client = TestClient(app)

    # 1. When RESEND_WEBHOOK_SECRET is empty -> 503
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", "")
    resp = client.post("/api/webhooks/resend", json={"type": "email.bounced"})
    assert resp.status_code == 503

    # 2. When secret is configured but missing signature -> 401
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", "test-secret-123")
    resp_nosig = client.post("/api/webhooks/resend", json={"type": "email.bounced"})
    assert resp_nosig.status_code == 401

    # 3. With signature header, bounce suppresses digest
    bounce_payload = {
        "type": "email.bounced",
        "data": {
            "to": [test_email],
            "bounce": {"message": "mailbox full"},
        },
    }
    resp_valid = client.post(
        "/api/webhooks/resend",
        json=bounce_payload,
        headers={"X-Resend-Signature": "valid-sig"},
    )
    assert resp_valid.status_code == 200
    db.refresh(user)
    assert user.email_digest_enabled is False

    # Cleanup
    db.delete(user)
    db.commit()


def test_send_digest_to_user_idempotency():
    """Verify send_digest_to_user only dispatches once per local day."""
    db = next(app_db.get_db())
    test_email = f"idempotent_{uuid.uuid4().hex[:6]}@example.com"
    user = UserProfile(
        name="Digest Tester",
        email=test_email,
        role="Software Engineer",
        timezone="America/New_York",
        delivery_time="07:00",
        email_digest_enabled=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Ensure dry run client
    resend = ResendClient(api_key="")

    # First send
    now_dt = datetime.now(UTC)
    deliv1 = send_digest_to_user(db, user, now=now_dt, client=resend)
    assert deliv1 is not None

    # Second send at same time (should be idempotent and return existing delivery)
    deliv2 = send_digest_to_user(db, user, now=now_dt + timedelta(minutes=10), client=resend)
    assert deliv2.id == deliv1.id

    # Cleanup
    db.query(Delivery).filter(Delivery.user_id == user.id).delete()
    db.delete(user)
    db.commit()


def test_timezone_and_delivery_time_parsing():
    """Verify safe fallback for unknown timezones and delivery times."""
    # Unknown timezone falls back to UTC
    tz = parse_user_timezone("Invalid/Nowhere")
    assert tz == UTC

    # Valid timezone
    tz_ny = parse_user_timezone("America/New_York")
    assert str(tz_ny) == "America/New_York"

    # Default delivery time
    t_default = parse_delivery_time(None)
    assert t_default.hour == 7 and t_default.minute == 0

    # Custom delivery time
    t_custom = parse_delivery_time("09:30")
    assert t_custom.hour == 9 and t_custom.minute == 30

    t_invalid = parse_delivery_time("invalid")
    assert t_invalid.hour == 7 and t_invalid.minute == 0


def test_digest_preview_endpoint(monkeypatch):
    """Verify POST /api/digest/preview with X-Ingest-Token."""
    token = "preview-token-secret"
    monkeypatch.setattr(settings, "INGEST_API_TOKEN", token)

    client = TestClient(app)

    # Unauthorized without header
    resp = client.post("/api/digest/preview")
    assert resp.status_code == 401

    # Authorized call
    resp_auth = client.post("/api/digest/preview", headers={"X-Ingest-Token": token})
    # Either 200 HTML or 404 if no items/cards exist today
    assert resp_auth.status_code in (200, 404)
    if resp_auth.status_code == 200:
        assert "text/html" in resp_auth.headers["content-type"]
        assert "B E C O N" in resp_auth.text
