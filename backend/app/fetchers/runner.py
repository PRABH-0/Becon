"""Fetcher runner and database synchronization orchestrator.

Fetches active sources, enforces deduplication by (source_id, url_hash),
updates source health records, and persists clean raw_items without invoking Gemini.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import List

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.fetchers.base import registry
from app.fetchers.http_client import SafeHTTPClient, sanitize_error_message
from app.ingestion import compute_hash, normalize_url
from app.models import RawItem, Source
from app.scheduler.timing import calculate_next_fetch_at

logger = logging.getLogger("becon.fetchers.runner")


@dataclass
class SourceFetchSummary:
    """Execution summary for a single source fetch run."""

    slug: str
    status: str  # "ok", "not_modified", "error", "skipped"
    items_fetched: int = 0
    new_inserted: int = 0
    duplicates_skipped: int = 0
    duration_seconds: float = 0.0
    next_fetch_at: datetime | None = None
    error: str | None = None


def fetch_and_store_source(
    db: Session,
    source: Source,
    client: SafeHTTPClient,
    limit: int | None = None,
) -> SourceFetchSummary:
    """Fetch a single source, deduplicate items, and persist new raw_items to DB."""
    fetcher = registry.get(source.source_type)
    if not fetcher:
        msg = f"No fetcher registered for source type '{source.source_type}'"
        logger.warning(msg)
        return SourceFetchSummary(
            slug=source.slug,
            status="skipped",
            error=msg,
        )

    now = datetime.now(UTC)
    source.last_fetched_at = now

    try:
        result = fetcher.fetch(source, client, limit=limit)
    except Exception as e:
        err_msg = sanitize_error_message(str(e))
        logger.error("Unhandled error fetching source %s: %s", source.slug, err_msg)
        source.consecutive_failures += 1
        source.last_error = err_msg
        threshold = getattr(settings, "FETCH_FAILING_THRESHOLD", 10)
        source.status = "failing" if source.consecutive_failures >= threshold else "degraded"
        source.next_fetch_at = calculate_next_fetch_at(source, now, is_success=False)
        source.lease_expires_at = None
        source.fetch_started_at = None
        db.commit()
        return SourceFetchSummary(
            slug=source.slug,
            status="error",
            duration_seconds=0.0,
            next_fetch_at=source.next_fetch_at,
            error=err_msg,
        )

    summary = SourceFetchSummary(
        slug=source.slug,
        status=result.status,
        duration_seconds=result.duration_seconds,
    )

    if result.status == "not_modified":
        # HTTP 304 - Not Modified
        source.last_success_at = now
        source.consecutive_failures = 0
        source.last_error = None
        source.status = "healthy"
        source.next_fetch_at = calculate_next_fetch_at(source, now, is_success=True)
        source.lease_expires_at = None
        source.fetch_started_at = None
        summary.next_fetch_at = source.next_fetch_at
        db.commit()
        return summary

    if result.status == "error":
        err_msg = sanitize_error_message(result.error or "Unknown fetch error")
        source.consecutive_failures += 1
        source.last_error = err_msg
        threshold = getattr(settings, "FETCH_FAILING_THRESHOLD", 10)
        source.status = "failing" if source.consecutive_failures >= threshold else "degraded"
        source.next_fetch_at = calculate_next_fetch_at(
            source,
            now,
            is_success=False,
            retry_after_seconds=result.retry_after_seconds,
        )
        source.lease_expires_at = None
        source.fetch_started_at = None
        summary.next_fetch_at = source.next_fetch_at
        summary.error = err_msg
        db.commit()
        return summary

    # HTTP 200 OK - Process extracted items
    summary.items_fetched = len(result.items)
    new_count = 0
    dup_count = 0
    seen_hashes_in_batch: set[str] = set()

    for item in result.items:
        clean_url = normalize_url(item.url)
        url_hash = compute_hash(clean_url)

        # In-batch duplicate check
        if url_hash in seen_hashes_in_batch:
            dup_count += 1
            continue

        # Database deduplication check against (source_id, url_hash)
        existing = (
            db.query(RawItem.id)
            .filter(
                RawItem.source_id == source.id,
                RawItem.url_hash == url_hash,
            )
            .first()
        )

        if existing:
            dup_count += 1
            continue

        seen_hashes_in_batch.add(url_hash)

        # Create new RawItem (plain-text only, raw_metadata preserved)
        raw_item = RawItem(
            source_id=source.id,
            external_id=item.external_id,
            url=clean_url,
            url_hash=url_hash,
            title=item.title,
            summary=item.summary,
            content_text=item.content_text,
            published_at=item.published_at,
            fetched_at=now,
            raw_metadata=item.raw_metadata,
            status="new",
        )
        db.add(raw_item)
        new_count += 1

    # Update source health and conditional validators
    if result.new_etag:
        source.etag = result.new_etag
    if result.new_last_modified:
        source.last_modified = result.new_last_modified

    source.last_success_at = now
    source.consecutive_failures = 0
    source.last_error = None
    source.status = "healthy"
    source.next_fetch_at = calculate_next_fetch_at(source, now, is_success=True)
    source.lease_expires_at = None
    source.fetch_started_at = None
    summary.next_fetch_at = source.next_fetch_at

    try:
        db.commit()
    except Exception as commit_err:
        db.rollback()
        err_msg = sanitize_error_message(f"Commit failure: {commit_err}")
        logger.error("DB commit failed for source %s: %s", source.slug, err_msg)
        source.consecutive_failures += 1
        source.last_error = err_msg
        threshold = getattr(settings, "FETCH_FAILING_THRESHOLD", 10)
        source.status = "failing" if source.consecutive_failures >= threshold else "degraded"
        source.next_fetch_at = calculate_next_fetch_at(source, now, is_success=False)
        source.lease_expires_at = None
        source.fetch_started_at = None
        summary.status = "error"
        summary.error = err_msg
        summary.new_inserted = 0
        summary.next_fetch_at = source.next_fetch_at
        db.commit()
        return summary

    summary.new_inserted = new_count
    summary.duplicates_skipped = dup_count
    return summary


def run_fetch(
    db: Session | None = None,
    source_slugs: List[str] | None = None,
    limit: int | None = None,
    client: SafeHTTPClient | None = None,
) -> List[SourceFetchSummary]:
    """Execute fetch run across active sources and return summary results."""
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True

    if client is None:
        client = SafeHTTPClient()

    summaries: List[SourceFetchSummary] = []
    try:
        query = db.query(Source).filter(Source.enabled == True)  # noqa: E712
        if source_slugs:
            query = query.filter(Source.slug.in_(source_slugs))

        sources = query.order_by(Source.slug).all()
        if not sources:
            logger.info("No active sources found to fetch.")
            return []

        for source in sources:
            try:
                res = fetch_and_store_source(db, source, client, limit=limit)
                summaries.append(res)
            except Exception as e:
                # Isolate source failure so entire run never aborts
                err_msg = sanitize_error_message(str(e))
                logger.error("Source %s threw unexpected error: %s", source.slug, err_msg)
                summaries.append(
                    SourceFetchSummary(
                        slug=source.slug,
                        status="error",
                        error=err_msg,
                    )
                )

        return summaries
    finally:
        if close_session:
            db.close()
