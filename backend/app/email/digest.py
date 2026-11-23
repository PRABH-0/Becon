"""Daily email digest builder, scheduler, and delivery manager (Task F7)."""

from __future__ import annotations

import logging
import uuid
import zoneinfo
from datetime import UTC, datetime
from datetime import time as dt_time
from typing import Tuple

from sqlalchemy.orm import Session

from app.briefing_service import build_daily_briefing
from app.config import settings
from app.email.resend_client import ResendClient
from app.email.signer import generate_unsubscribe_token
from app.email.templates import render_digest_html, render_digest_text
from app.models import Delivery, UserProfile
from app.schemas import BriefingCard

logger = logging.getLogger("becon.email.digest")


def parse_user_timezone(tz_name: str | None) -> datetime.tzinfo:
    """Safely parse timezone name, falling back to UTC on invalid or missing names."""
    if not tz_name or not tz_name.strip():
        return UTC
    try:
        return zoneinfo.ZoneInfo(tz_name.strip())
    except Exception:
        logger.debug("Invalid timezone '%s', falling back to UTC", tz_name)
        return UTC


def parse_delivery_time(time_str: str | None) -> dt_time:
    """Parse 'HH:MM' string to time object, defaulting to 07:00."""
    if not time_str:
        return dt_time(7, 0)
    try:
        parts = time_str.strip().split(":")
        return dt_time(int(parts[0]), int(parts[1]))
    except Exception:
        return dt_time(7, 0)


def build_user_digest(
    db: Session,
    user: UserProfile,
    now: datetime | None = None,
) -> Tuple[str, str, list[BriefingCard], int, str] | None:
    """Build personalized daily digest for an eligible user.

    Returns:
        (html_body, text_body, cards, reading_time_minutes, unsubscribe_url) or None if ineligible/empty.
    """
    if not user.email or not user.email.strip():
        logger.debug("User %s has no email address, skipping digest", user.id)
        return None

    if user.is_anonymous:
        logger.debug("User %s is an anonymous guest, skipping digest", user.id)
        return None

    if not user.email_digest_enabled:
        logger.debug("User %s has disabled email digests, skipping", user.id)
        return None

    if user.deleted_at is not None:
        logger.debug("User %s is soft-deleted, skipping digest", user.id)
        return None

    current_dt = now or datetime.now(UTC)
    user_tz = parse_user_timezone(user.timezone)
    user_local_dt = current_dt.astimezone(user_tz)
    today_str = user_local_dt.strftime("%A, %B %d, %Y")

    # Generate or retrieve cached daily briefing (Zero Gemini calls!)
    cards = build_daily_briefing(
        db=db,
        user=user,
        user_interests=user.interests or "",
        user_role=user.role or "Professional",
    )

    if not cards:
        logger.info("User %s has no briefing cards today, skipping digest", user.id)
        return None

    total_reading_time = sum(getattr(c, "reading_time_minutes", 1) or 1 for c in cards)
    token = generate_unsubscribe_token(user.id)
    base_url = (settings.APP_BASE_URL or "http://localhost:3000").rstrip("/")
    unsubscribe_url = f"{base_url}/unsubscribe?token={token}"
    preferences_url = f"{base_url}/profile"

    html_content = render_digest_html(
        user_name=user.name or "Reader",
        user_role=user.role or "Professional",
        cards=cards,
        today_str=today_str,
        reading_time_minutes=total_reading_time,
        unsubscribe_url=unsubscribe_url,
        preferences_url=preferences_url,
        base_url=base_url,
    )

    text_content = render_digest_text(
        user_name=user.name or "Reader",
        user_role=user.role or "Professional",
        cards=cards,
        today_str=today_str,
        reading_time_minutes=total_reading_time,
        unsubscribe_url=unsubscribe_url,
        preferences_url=preferences_url,
        base_url=base_url,
    )

    return (html_content, text_content, cards, total_reading_time, unsubscribe_url)


def send_digest_to_user(
    db: Session,
    user: UserProfile,
    now: datetime | None = None,
    client: ResendClient | None = None,
) -> Delivery:
    """Send daily digest email to user idempotently, recording in deliveries table."""
    current_dt = now or datetime.now(UTC)
    user_tz = parse_user_timezone(user.timezone)
    user_local_dt = current_dt.astimezone(user_tz)
    local_date_str = user_local_dt.strftime("%Y-%m-%d")

    # Idempotency check: 1 digest per user per local day
    # Check if a non-failed delivery already exists for this local date
    existing_deliveries = (
        db.query(Delivery)
        .filter(
            Delivery.user_id == user.id,
            Delivery.channel == "email",
            Delivery.kind == "digest",
        )
        .all()
    )

    for deliv in existing_deliveries:
        sched_dt = deliv.scheduled_for
        if sched_dt:
            if sched_dt.tzinfo is None:
                sched_dt = sched_dt.replace(tzinfo=UTC)
            deliv_local_date = sched_dt.astimezone(user_tz).strftime("%Y-%m-%d")
            if deliv_local_date == local_date_str and deliv.status in ("sent", "pending", "skipped"):
                logger.info("Digest already processed/sent for user %s on %s", user.id, local_date_str)
                return deliv

    digest_bundle = build_user_digest(db, user, now=current_dt)
    if digest_bundle is None:
        # User not eligible or empty briefing
        delivery = Delivery(
            id=uuid.uuid4(),
            user_id=user.id,
            channel="email",
            kind="digest",
            scheduled_for=current_dt,
            status="skipped",
            error="empty_briefing_or_ineligible",
            created_at=current_dt,
        )
        db.add(delivery)
        db.commit()
        return delivery

    html_body, text_body, cards, reading_time, unsubscribe_url = digest_bundle
    subject = f"Becon Daily: {cards[0].title} (~{reading_time} min read)"

    resend = client or ResendClient()
    res = resend.send_email(
        to=user.email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        unsubscribe_url=unsubscribe_url,
    )

    delivery = Delivery(
        id=uuid.uuid4(),
        user_id=user.id,
        channel="email",
        kind="digest",
        scheduled_for=current_dt,
        sent_at=current_dt if res.status == "sent" else None,
        status=res.status,
        provider_message_id=res.id if res.status == "sent" else None,
        error=res.error,
        payload_ref={
            "cards_count": len(cards),
            "reading_time_minutes": reading_time,
            "local_date": local_date_str,
            "is_dry_run": res.is_dry_run,
        },
        created_at=current_dt,
    )
    db.add(delivery)
    db.commit()
    return delivery


def run_digest_scheduler_batch(
    db: Session,
    now: datetime | None = None,
    batch_size: int | None = None,
    client: ResendClient | None = None,
) -> int:
    """Run scheduled digest check for users whose delivery time has arrived today."""
    if not settings.DIGEST_SCHEDULER_ENABLED:
        logger.debug("Digest scheduler is disabled in settings")
        return 0

    current_dt = now or datetime.now(UTC)
    effective_batch = batch_size or settings.DIGEST_MAX_PER_RUN

    eligible_users = (
        db.query(UserProfile)
        .filter(
            UserProfile.email_digest_enabled.is_(True),
            UserProfile.is_anonymous.is_(False),
            UserProfile.email.is_not(None),
            UserProfile.deleted_at.is_(None),
        )
        .all()
    )

    sent_count = 0
    for user in eligible_users:
        if sent_count >= effective_batch:
            break

        user_tz = parse_user_timezone(user.timezone)
        user_local = current_dt.astimezone(user_tz)
        target_time = parse_delivery_time(user.delivery_time)

        # Check if local time is at or after scheduled delivery time
        if user_local.time() >= target_time:
            # Check if already delivered today in user's local date
            local_date_str = user_local.strftime("%Y-%m-%d")
            already_done = False

            existing = (
                db.query(Delivery)
                .filter(
                    Delivery.user_id == user.id,
                    Delivery.channel == "email",
                    Delivery.kind == "digest",
                )
                .all()
            )
            for d in existing:
                if d.scheduled_for:
                    sched = d.scheduled_for
                    if sched.tzinfo is None:
                        sched = sched.replace(tzinfo=UTC)
                    d_local = sched.astimezone(user_tz).strftime("%Y-%m-%d")
                    if d_local == local_date_str and d.status in ("sent", "skipped"):
                        already_done = True
                        break

            if not already_done:
                logger.info("Dispatching daily digest for user %s (%s)", user.id, user.email)
                deliv = send_digest_to_user(db, user, now=current_dt, client=client)
                if deliv.status == "sent":
                    sent_count += 1

    return sent_count
