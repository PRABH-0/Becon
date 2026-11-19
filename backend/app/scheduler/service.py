"""Scheduler engine: concurrency coordination, hard timeouts, and lifecycle management."""

import asyncio
import logging
import urllib.parse
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Callable, Dict, List

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.fetchers.base import SourceFetchSummary
from app.fetchers.http_client import SafeHTTPClient, sanitize_error_message
from app.models import Source
from app.scheduler.timing import (
    claim_source_lease,
    get_due_sources,
    release_source_lease,
)

logger = logging.getLogger("becon.scheduler")


class SchedulerEngine:
    """Async scheduler orchestrating concurrent source fetching with per-host limits."""

    def __init__(
        self,
        db_factory: Callable[[], Session] = SessionLocal,
        global_concurrency: int | None = None,
        source_timeout_seconds: float | None = None,
        failing_threshold: int | None = None,
        max_backoff_minutes: int | None = None,
        client: SafeHTTPClient | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.db_factory = db_factory
        self.global_concurrency = (
            global_concurrency
            if global_concurrency is not None
            else getattr(settings, "FETCH_GLOBAL_CONCURRENCY", 4)
        )
        self.source_timeout_seconds = (
            source_timeout_seconds
            if source_timeout_seconds is not None
            else float(getattr(settings, "FETCH_SOURCE_TIMEOUT_SECONDS", 45))
        )
        self.failing_threshold = (
            failing_threshold
            if failing_threshold is not None
            else getattr(settings, "FETCH_FAILING_THRESHOLD", 10)
        )
        self.max_backoff_minutes = (
            max_backoff_minutes
            if max_backoff_minutes is not None
            else getattr(settings, "FETCH_MAX_BACKOFF_MINUTES", 360)
        )
        self.client = client or SafeHTTPClient()
        self.clock = clock or (lambda: datetime.now(UTC))

        self.global_sem = asyncio.Semaphore(self.global_concurrency)
        self.host_sems: Dict[str, asyncio.Semaphore] = defaultdict(lambda: asyncio.Semaphore(1))

    def _extract_host(self, source: Source) -> str:
        url = source.feed_url or source.site_url or ""
        try:
            parsed = urllib.parse.urlparse(url)
            return (parsed.hostname or "unknown").lower()
        except Exception:
            return "unknown"

    def execute_source_fetch_sync(
        self,
        source_id: uuid.UUID,
        limit: int | None = None,
    ) -> SourceFetchSummary:
        """Synchronously execute a single source fetch within its own DB transaction."""
        from app.fetchers.runner import fetch_and_store_source

        db = self.db_factory()
        try:
            source = db.query(Source).filter(Source.id == source_id).first()
            if not source or not source.enabled:
                return SourceFetchSummary(
                    slug=str(source_id),
                    status="skipped",
                    error="Source not found or disabled",
                )

            summary = fetch_and_store_source(db, source, self.client, limit=limit)
            return summary
        finally:
            db.close()

    async def fetch_source_task(
        self,
        source_id: uuid.UUID,
        source_slug: str,
        host: str,
        limit: int | None = None,
    ) -> SourceFetchSummary:
        """Acquire semaphores, claim DB lease, and fetch source with hard timeout."""
        now = self.clock()
        db = self.db_factory()
        try:
            # 1. Attempt atomic lease acquisition
            lease_duration = max(int(self.source_timeout_seconds * 2), 60)
            acquired = claim_source_lease(db, source_id, now, lease_seconds=lease_duration)
            if not acquired:
                logger.info("Source %s lease held by another worker; skipping", source_slug)
                return SourceFetchSummary(
                    slug=source_slug,
                    status="skipped",
                    error="Lease held by another worker",
                )
        finally:
            db.close()

        host_sem = self.host_sems[host]
        async with self.global_sem:
            async with host_sem:
                try:
                    summary = await asyncio.wait_for(
                        asyncio.to_thread(self.execute_source_fetch_sync, source_id, limit),
                        timeout=self.source_timeout_seconds,
                    )
                    return summary
                except TimeoutError:
                    err_msg = f"Fetch timed out after {self.source_timeout_seconds}s"
                    logger.warning("Source %s exceeded timeout cap (%.1fs)", source_slug, self.source_timeout_seconds)
                    db_err = self.db_factory()
                    try:
                        release_source_lease(
                            db_err,
                            source_id,
                            now=self.clock(),
                            error_msg=err_msg,
                        )
                    finally:
                        db_err.close()

                    return SourceFetchSummary(
                        slug=source_slug,
                        status="error",
                        duration_seconds=self.source_timeout_seconds,
                        error=err_msg,
                    )
                except Exception as e:
                    err_msg = sanitize_error_message(f"Worker failure: {e}")
                    logger.error("Source %s worker error: %s", source_slug, err_msg)
                    db_err = self.db_factory()
                    try:
                        release_source_lease(
                            db_err,
                            source_id,
                            now=self.clock(),
                            error_msg=err_msg,
                        )
                    finally:
                        db_err.close()

                    return SourceFetchSummary(
                        slug=source_slug,
                        status="error",
                        error=err_msg,
                    )

    async def run_due_cycle(self, limit: int | None = None) -> List[SourceFetchSummary]:
        """Query currently due sources and fetch them concurrently within limits."""
        now = self.clock()
        db = self.db_factory()
        try:
            due_sources = get_due_sources(db, now)
            if not due_sources:
                return []

            source_targets = [
                (s.id, s.slug, self._extract_host(s))
                for s in due_sources
            ]
        finally:
            db.close()

        logger.info("Found %d due source(s) for fetch cycle", len(source_targets))
        tasks = [
            self.fetch_source_task(src_id, slug, host, limit=limit)
            for src_id, slug, host in source_targets
        ]

        results = await asyncio.gather(*tasks, return_exceptions=False)
        return results

    async def run_continuous(
        self,
        tick_seconds: int = 10,
        stop_event: asyncio.Event | None = None,
        limit: int | None = None,
    ) -> None:
        """Run continuous scheduler loop until stop_event is signaled."""
        if stop_event is None:
            stop_event = asyncio.Event()

        logger.info(
            "Starting scheduler worker (tick: %ds, concurrency: %d, timeout: %.1fs, max_backoff: %dm)",
            tick_seconds,
            self.global_concurrency,
            self.source_timeout_seconds,
            self.max_backoff_minutes,
        )

        while not stop_event.is_set():
            try:
                summaries = await self.run_due_cycle(limit=limit)
                if summaries:
                    ok_count = sum(1 for s in summaries if s.status in ("ok", "not_modified"))
                    err_count = sum(1 for s in summaries if s.status == "error")
                    logger.info("Cycle completed: %d sources (%d ok, %d errors)", len(summaries), ok_count, err_count)
            except Exception as e:
                logger.error("Unhandled error in scheduler tick: %s", sanitize_error_message(str(e)))

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=tick_seconds)
            except TimeoutError:
                pass  # Tick interval elapsed, continue loop

        logger.info("Scheduler worker shut down gracefully.")
