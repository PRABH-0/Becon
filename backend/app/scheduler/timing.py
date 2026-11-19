"""Timing, backoff calculation, due checks, and atomic lease locking for sources."""

import logging
import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import List

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.fetchers.http_client import sanitize_error_message
from app.models import Source

logger = logging.getLogger("becon.scheduler.timing")


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Ensure a datetime object is timezone-aware and set to UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def calculate_next_fetch_at(
    source: Source,
    now: datetime,
    is_success: bool,
    retry_after_seconds: float | None = None,
    base_backoff_minutes: int = 5,
    max_backoff_minutes: int | None = None,
    jitter_ratio: float = 0.10,
) -> datetime:
    """Calculate next_fetch_at timestamp with jitter and exponential backoff on failure.

    Args:
        source: The Source ORM instance.
        now: Current UTC timestamp.
        is_success: Whether the current fetch succeeded (HTTP 200 or 304).
        retry_after_seconds: Optional Retry-After header delay in seconds.
        base_backoff_minutes: Initial failure backoff base in minutes.
        max_backoff_minutes: Maximum retry backoff cap in minutes.
        jitter_ratio: Proportion of jitter (e.g. 0.10 for +/- 10%).

    Returns:
        Next scheduled UTC datetime.
    """
    if max_backoff_minutes is None:
        max_backoff_minutes = getattr(settings, "FETCH_MAX_BACKOFF_MINUTES", 360)

    now = ensure_utc(now) or datetime.now(UTC)

    if is_success:
        interval_minutes = max(1, source.fetch_interval_minutes)
        jitter = random.uniform(-jitter_ratio, jitter_ratio) if jitter_ratio > 0 else 0.0
        delay_seconds = interval_minutes * 60.0 * (1.0 + jitter)
        return now + timedelta(seconds=max(30.0, delay_seconds))

    # Error case
    if retry_after_seconds is not None and retry_after_seconds > 0:
        delay_seconds = retry_after_seconds
    else:
        failures = max(1, source.consecutive_failures)
        # Power bounded to prevent overflow: 2^failures
        power = min(failures, 10)
        backoff_minutes = min(base_backoff_minutes * (2**power), max_backoff_minutes)
        delay_seconds = backoff_minutes * 60.0

    jitter = random.uniform(-jitter_ratio, jitter_ratio) if jitter_ratio > 0 else 0.0
    delay_seconds = delay_seconds * (1.0 + jitter)
    return now + timedelta(seconds=max(10.0, delay_seconds))


def is_source_due(source: Source, now: datetime) -> bool:
    """Evaluate whether an active source is due for fetching."""
    if not source.enabled:
        return False

    now_utc = ensure_utc(now) or datetime.now(UTC)
    lease_exp = ensure_utc(source.lease_expires_at)
    next_f = ensure_utc(source.next_fetch_at)
    last_f = ensure_utc(source.last_fetched_at)

    # Check if another process holds an unexpired lease
    if lease_exp is not None and lease_exp > now_utc:
        return False

    # If next_fetch_at is explicitly set, honor it
    if next_f is not None:
        return now_utc >= next_f

    # If never fetched, it is due immediately
    if last_f is None:
        return True

    # Fallback to last_fetched_at + poll interval
    poll_delta = timedelta(minutes=max(1, source.fetch_interval_minutes))
    return now_utc >= (last_f + poll_delta)


def claim_source_lease(
    db: Session,
    source_id: uuid.UUID,
    now: datetime,
    lease_seconds: int = 90,
) -> bool:
    """Atomically claim a fetch lease in the database.

    Returns:
        True if the lease was successfully claimed, False if already held.
    """
    now_utc = ensure_utc(now) or datetime.now(UTC)
    lease_expiry = now_utc + timedelta(seconds=lease_seconds)
    updated = (
        db.query(Source)
        .filter(
            Source.id == source_id,
            Source.enabled == True,  # noqa: E712
            or_(
                Source.lease_expires_at.is_(None),
                Source.lease_expires_at <= now_utc,
            ),
        )
        .update(
            {
                Source.fetch_started_at: now_utc,
                Source.lease_expires_at: lease_expiry,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return updated > 0


def release_source_lease(
    db: Session,
    source_id: uuid.UUID,
    now: datetime | None = None,
    error_msg: str | None = None,
    retry_after_seconds: float | None = None,
) -> None:
    """Release an acquired lease and update failure metadata if an error occurred."""
    now_utc = ensure_utc(now) or datetime.now(UTC)

    source = db.query(Source).filter(Source.id == source_id).first()
    if not source:
        return

    source.lease_expires_at = None
    source.fetch_started_at = None

    if error_msg:
        clean_err = sanitize_error_message(error_msg)
        source.consecutive_failures += 1
        source.last_error = clean_err
        threshold = getattr(settings, "FETCH_FAILING_THRESHOLD", 10)
        source.status = "failing" if source.consecutive_failures >= threshold else "degraded"
        source.next_fetch_at = calculate_next_fetch_at(
            source,
            now=now_utc,
            is_success=False,
            retry_after_seconds=retry_after_seconds,
        )

    db.commit()


def get_due_sources(db: Session, now: datetime) -> List[Source]:
    """Retrieve all enabled, non-leased sources that are due for fetching."""
    candidates = (
        db.query(Source)
        .filter(
            Source.enabled == True,  # noqa: E712
            or_(
                Source.lease_expires_at.is_(None),
                Source.lease_expires_at <= now,
            ),
        )
        .order_by(
            Source.next_fetch_at.asc().nullsfirst(),
            Source.slug.asc(),
        )
        .all()
    )
    return [s for s in candidates if is_source_due(s, now)]
