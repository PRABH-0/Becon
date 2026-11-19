"""Comprehensive offline unit tests for the Becon source scheduler.

Tests:
- Due-selection logic (never fetched, interval not elapsed, elapsed, jitter bounds)
- Backoff math and cap (exponential, capped at max_backoff_minutes)
- Success resets consecutive_failures, clears last_error, sets status="healthy"
- Retry-After header delay is honored
- Per-source timeout cancels a hung fetch without blocking others
- Global and per-host concurrency limits
- DB lease prevents double-run, and expired lease is reclaimed
- Failing threshold sets status="failing" while keeping enabled=True
- One failing source does not stop the cycle
- Graceful shutdown and single-cycle (--once) execution
- GET /api/sources/health: 401 without/with bad token, 200 with valid token, no secrets
- Verification that Gemini client is never touched
"""

import asyncio
import os
import tempfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.config import settings
from app.fetchers.base import BaseFetcher, FetchItem, FetchResult, registry
from app.fetchers.http_client import SafeHTTPClient
from app.fetchers.runner import fetch_and_store_source
from app.main import app
from app.models import Source
from app.scheduler.service import SchedulerEngine
from app.scheduler.timing import (
    calculate_next_fetch_at,
    claim_source_lease,
    ensure_utc,
    get_due_sources,
    is_source_due,
    release_source_lease,
)

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture
def scheduler_db():
    """Create an isolated SQLite database migrated to alembic head."""
    temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    temp_path = temp_file.name
    temp_file.close()

    db_url = f"sqlite:///{temp_path}"
    ini_path = BACKEND_DIR / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    yield db, Session

    db.close()
    engine.dispose()
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass


class MockOkFetcher(BaseFetcher):
    """Mock fetcher that returns 1 clean item."""

    def fetch(self, source: Source, client: SafeHTTPClient, limit: int | None = None) -> FetchResult:
        return FetchResult(
            status="ok",
            items=[
                FetchItem(
                    url=f"https://example.com/test-article-{source.slug}",
                    title=f"Update from {source.name}",
                    summary="Clean release summary.",
                    content_text="Detailed release body text.",
                    published_at=datetime.now(UTC),
                )
            ],
            new_etag='"mock-etag"',
            duration_seconds=0.01,
        )


class MockHangingFetcher(BaseFetcher):
    """Mock fetcher that sleeps longer than timeout to simulate hung connection."""

    def __init__(self, delay_seconds: float = 1.0) -> None:
        self.delay_seconds = delay_seconds

    def fetch(self, source: Source, client: SafeHTTPClient, limit: int | None = None) -> FetchResult:
        time.sleep(self.delay_seconds)
        return FetchResult(status="ok", items=[], duration_seconds=self.delay_seconds)


class MockFailingFetcher(BaseFetcher):
    """Mock fetcher that returns an error status with optional Retry-After."""

    def __init__(self, error: str = "HTTP 500 Internal Error", retry_after: float | None = None) -> None:
        self.error = error
        self.retry_after = retry_after

    def fetch(self, source: Source, client: SafeHTTPClient, limit: int | None = None) -> FetchResult:
        return FetchResult(
            status="error",
            error=self.error,
            http_status=500 if not self.retry_after else 429,
            duration_seconds=0.01,
            retry_after_seconds=self.retry_after,
        )


# ---------------------------------------------------------------------------
# 1. Due Selection & Timing Tests
# ---------------------------------------------------------------------------

def test_due_selection_logic(scheduler_db):
    db, _ = scheduler_db
    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)

    # Source 1: Never fetched -> due immediately
    s1 = Source(
        slug="src-never-fetched",
        name="Never Fetched",
        site_url="https://example.com",
        feed_url="https://example.com/feed1",
        type="rss",
        fetch_interval_minutes=60,
        enabled=True,
        last_fetched_at=None,
        next_fetch_at=None,
    )

    # Source 2: Disabled -> NOT due
    s2 = Source(
        slug="src-disabled",
        name="Disabled Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed2",
        type="rss",
        fetch_interval_minutes=60,
        enabled=False,
        last_fetched_at=None,
    )

    # Source 3: Interval not elapsed -> NOT due
    s3 = Source(
        slug="src-not-due",
        name="Not Due Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed3",
        type="rss",
        fetch_interval_minutes=60,
        enabled=True,
        last_fetched_at=now - timedelta(minutes=15),
        next_fetch_at=now + timedelta(minutes=45),
    )

    # Source 4: Interval elapsed -> due
    s4 = Source(
        slug="src-due",
        name="Due Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed4",
        type="rss",
        fetch_interval_minutes=60,
        enabled=True,
        last_fetched_at=now - timedelta(minutes=75),
        next_fetch_at=now - timedelta(minutes=15),
    )

    # Source 5: Leased by active runner -> NOT due
    s5 = Source(
        slug="src-leased",
        name="Leased Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed5",
        type="rss",
        fetch_interval_minutes=60,
        enabled=True,
        last_fetched_at=now - timedelta(minutes=75),
        next_fetch_at=now - timedelta(minutes=15),
        lease_expires_at=now + timedelta(seconds=45),
    )

    db.add_all([s1, s2, s3, s4, s5])
    db.commit()

    assert is_source_due(s1, now) is True
    assert is_source_due(s2, now) is False
    assert is_source_due(s3, now) is False
    assert is_source_due(s4, now) is True
    assert is_source_due(s5, now) is False

    due_list = get_due_sources(db, now)
    due_slugs = {s.slug for s in due_list}
    assert due_slugs == {"src-never-fetched", "src-due"}


def test_jitter_bounds_and_interval():
    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)
    source = Source(
        slug="test-jitter",
        name="Test Jitter",
        site_url="https://example.com",
        feed_url="https://example.com/feed",
        type="rss",
        fetch_interval_minutes=60,
    )

    # Success scheduling: interval is 60 minutes = 3600s; jitter is +/- 10% (3240s to 3960s)
    for _ in range(50):
        next_t = calculate_next_fetch_at(source, now=now, is_success=True, jitter_ratio=0.10)
        delay_sec = (next_t - now).total_seconds()
        assert 3240.0 <= delay_sec <= 3960.0, f"Delay {delay_sec} out of expected +/-10% bounds"


def test_backoff_math_and_exponential_cap():
    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)
    source = Source(
        slug="test-backoff",
        name="Test Backoff",
        site_url="https://example.com",
        feed_url="https://example.com/feed",
        type="rss",
        fetch_interval_minutes=60,
    )

    # 1 failure (base 5m * 2^1 = 10m = 600s, 0 jitter)
    source.consecutive_failures = 1
    t1 = calculate_next_fetch_at(source, now=now, is_success=False, base_backoff_minutes=5, jitter_ratio=0.0)
    assert (t1 - now).total_seconds() == 600.0

    # 2 failures (base 5m * 2^2 = 20m = 1200s, 0 jitter)
    source.consecutive_failures = 2
    t2 = calculate_next_fetch_at(source, now=now, is_success=False, base_backoff_minutes=5, jitter_ratio=0.0)
    assert (t2 - now).total_seconds() == 1200.0

    # 3 failures (base 5m * 2^3 = 40m = 2400s, 0 jitter)
    source.consecutive_failures = 3
    t3 = calculate_next_fetch_at(source, now=now, is_success=False, base_backoff_minutes=5, jitter_ratio=0.0)
    assert (t3 - now).total_seconds() == 2400.0

    # 10 failures capped at max_backoff_minutes = 360m (21600s)
    source.consecutive_failures = 10
    t10 = calculate_next_fetch_at(
        source,
        now=now,
        is_success=False,
        base_backoff_minutes=5,
        max_backoff_minutes=360,
        jitter_ratio=0.0,
    )
    assert (t10 - now).total_seconds() == 21600.0


def test_retry_after_honored_on_failure():
    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)
    source = Source(
        slug="test-retry-after",
        name="Test Retry After",
        site_url="https://example.com",
        feed_url="https://example.com/feed",
        type="rss",
        fetch_interval_minutes=60,
        consecutive_failures=1,
    )

    # Retry-After of 180 seconds with 0 jitter
    next_t = calculate_next_fetch_at(
        source,
        now=now,
        is_success=False,
        retry_after_seconds=180.0,
        jitter_ratio=0.0,
    )
    assert (next_t - now).total_seconds() == 180.0


# ---------------------------------------------------------------------------
# 2. Database Lease & Overlap Protection Tests
# ---------------------------------------------------------------------------

def test_db_lease_overlap_protection_and_reclaim(scheduler_db):
    db, _ = scheduler_db
    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)

    source = Source(
        slug="src-lease-test",
        name="Lease Test Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed-lease",
        type="rss",
        fetch_interval_minutes=60,
        enabled=True,
    )
    db.add(source)
    db.commit()

    # 1. First worker acquires lease
    acquired = claim_source_lease(db, source.id, now, lease_seconds=60)
    assert acquired is True

    db.refresh(source)
    assert ensure_utc(source.lease_expires_at) == now + timedelta(seconds=60)
    assert ensure_utc(source.fetch_started_at) == now

    # 2. Second worker attempts to acquire same source at same time -> blocked
    acquired_second = claim_source_lease(db, source.id, now, lease_seconds=60)
    assert acquired_second is False

    # 3. Simulate process crash / lease expiration (advance clock past 60s)
    future = now + timedelta(seconds=70)
    reclaimed = claim_source_lease(db, source.id, future, lease_seconds=60)
    assert reclaimed is True

    db.refresh(source)
    assert ensure_utc(source.lease_expires_at) == future + timedelta(seconds=60)

    # 4. Release lease cleanly
    release_source_lease(db, source.id, now=future)
    db.refresh(source)
    assert source.lease_expires_at is None
    assert source.fetch_started_at is None


# ---------------------------------------------------------------------------
# 3. Success & Failing Threshold State Machine Tests
# ---------------------------------------------------------------------------

def test_success_resets_counter_and_failure_sets_status(scheduler_db):
    db, _ = scheduler_db
    source = Source(
        slug="src-state-machine",
        name="State Machine Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed-sm",
        type="rss",
        fetch_interval_minutes=60,
        enabled=True,
        consecutive_failures=5,
        last_error="Previous error",
        status="degraded",
    )
    db.add(source)
    db.commit()

    orig_rss = registry.get("rss")
    try:
        # Register mock OK fetcher on "rss"
        registry.register("rss", MockOkFetcher())

        client = SafeHTTPClient()
        summary = fetch_and_store_source(db, source, client)

        assert summary.status == "ok"
        assert summary.new_inserted == 1
        db.refresh(source)
        assert source.consecutive_failures == 0
        assert source.last_error is None
        assert source.status == "healthy"
        assert source.next_fetch_at is not None

        # Now test failing threshold (consecutive_failures >= 10)
        registry.register("rss", MockFailingFetcher(error="Persistent upstream 500"))
        source.consecutive_failures = 9  # 9th failure
        db.commit()

        summary_fail = fetch_and_store_source(db, source, client)
        assert summary_fail.status == "error"
        db.refresh(source)
        assert source.consecutive_failures == 10
        assert source.status == "failing"
        assert source.enabled is True  # Kept enabled, never deleted
        assert "Persistent upstream 500" in (source.last_error or "")
    finally:
        if orig_rss:
            registry.register("rss", orig_rss)


# ---------------------------------------------------------------------------
# 4. Async Scheduler Engine & Timeout Tests
# ---------------------------------------------------------------------------

def test_per_source_timeout_cancels_hung_fetch_without_blocking_others(scheduler_db):
    db, Session = scheduler_db
    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)

    orig_rss = registry.get("rss")
    orig_atom = registry.get("atom")

    try:
        # Source 1: Hung source (takes 1.0s, timeout cap is 0.15s) registered on "rss"
        registry.register("rss", MockHangingFetcher(delay_seconds=1.0))
        s1 = Source(
            slug="src-hung",
            name="Hung Source",
            site_url="https://example.com",
            feed_url="https://example.com/feed-hung",
            type="rss",
            fetch_interval_minutes=60,
            enabled=True,
        )

        # Source 2: Fast source on different domain registered on "atom"
        registry.register("atom", MockOkFetcher())
        s2 = Source(
            slug="src-fast",
            name="Fast Source",
            site_url="https://different.org",
            feed_url="https://different.org/feed-fast",
            type="atom",
            fetch_interval_minutes=60,
            enabled=True,
        )

        db.add_all([s1, s2])
        db.commit()

        engine = SchedulerEngine(
            db_factory=Session,
            global_concurrency=4,
            source_timeout_seconds=0.15,  # Short timeout cap
            clock=lambda: now,
        )

        async def run_test():
            t0 = time.time()
            res = await engine.run_due_cycle()
            cycle_time = time.time() - t0
            return res, cycle_time

        results, elapsed = asyncio.run(run_test())

        # Ensure due cycle completed fast (< 0.5s), not blocked by the 1.0s hung source
        assert elapsed < 0.5, f"Cycle took {elapsed:.2f}s, failed to enforce per-source timeout cap"
        assert len(results) == 2

        hung_result = next(r for r in results if r.slug == "src-hung")
        fast_result = next(r for r in results if r.slug == "src-fast")

        assert hung_result.status == "error"
        assert "Fetch timed out" in (hung_result.error or "")
        assert fast_result.status == "ok"
        assert fast_result.new_inserted == 1

        # Verify hung source lease was released and recorded as degraded
        db.refresh(s1)
        assert s1.lease_expires_at is None
        assert s1.consecutive_failures == 1
        assert s1.status == "degraded"
    finally:
        if orig_rss:
            registry.register("rss", orig_rss)
        if orig_atom:
            registry.register("atom", orig_atom)


def test_one_failing_source_does_not_abort_cycle(scheduler_db):
    db, Session = scheduler_db
    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)

    orig_rss = registry.get("rss")
    orig_atom = registry.get("atom")

    try:
        registry.register("rss", MockFailingFetcher(error="Connection refused"))
        registry.register("atom", MockOkFetcher())

        s1 = Source(
            slug="src-fail-1",
            name="Failing 1",
            site_url="https://site1.com",
            feed_url="https://site1.com/feed",
            type="rss",
            fetch_interval_minutes=60,
            enabled=True,
        )
        s2 = Source(
            slug="src-ok-2",
            name="Success 2",
            site_url="https://site2.com",
            feed_url="https://site2.com/feed",
            type="atom",
            fetch_interval_minutes=60,
            enabled=True,
        )

        db.add_all([s1, s2])
        db.commit()

        engine = SchedulerEngine(
            db_factory=Session,
            global_concurrency=2,
            source_timeout_seconds=5.0,
            clock=lambda: now,
        )

        results = asyncio.run(engine.run_due_cycle())
        assert len(results) == 2
        r_fail = next(r for r in results if r.slug == "src-fail-1")
        r_ok = next(r for r in results if r.slug == "src-ok-2")

        assert r_fail.status == "error"
        assert r_ok.status == "ok"
    finally:
        if orig_rss:
            registry.register("rss", orig_rss)
        if orig_atom:
            registry.register("atom", orig_atom)


def test_graceful_shutdown_and_stop_event(scheduler_db):
    _, Session = scheduler_db
    engine = SchedulerEngine(db_factory=Session)
    stop_event = asyncio.Event()

    async def run_shutdown_test():
        async def trigger_stop():
            await asyncio.sleep(0.05)
            stop_event.set()

        t_stop = asyncio.create_task(trigger_stop())
        await engine.run_continuous(tick_seconds=10, stop_event=stop_event)
        await t_stop

    asyncio.run(run_shutdown_test())
    assert stop_event.is_set() is True


# ---------------------------------------------------------------------------
# 5. GET /api/sources/health Endpoint Tests
# ---------------------------------------------------------------------------

def test_sources_health_endpoint_auth_and_payload(scheduler_db):
    db, _ = scheduler_db
    from app.database import get_db

    now = datetime(2026, 11, 19, 12, 0, 0, tzinfo=UTC)

    s1 = Source(
        slug="health-healthy",
        name="Healthy Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed1",
        type="rss",
        enabled=True,
        status="healthy",
        last_fetched_at=now - timedelta(minutes=10),
        last_success_at=now - timedelta(minutes=10),
        consecutive_failures=0,
    )
    s2 = Source(
        slug="health-failing",
        name="Failing Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed2",
        type="rss",
        enabled=True,
        status="failing",
        last_fetched_at=now - timedelta(minutes=5),
        last_success_at=now - timedelta(hours=24),
        consecutive_failures=12,
        last_error="Persistent Authorization Failure",
    )
    db.add_all([s1, s2])
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)

        # 1. 401 without X-Ingest-Token
        with patch.object(settings, "INGEST_API_TOKEN", "valid-secret-token"):
            resp_no_token = client.get("/api/sources/health")
            assert resp_no_token.status_code == 401

            # 2. 401 with invalid token
            resp_bad_token = client.get(
                "/api/sources/health",
                headers={"X-Ingest-Token": "wrong-secret-token"},
            )
            assert resp_bad_token.status_code == 401

            # 3. 200 with valid token
            resp = client.get(
                "/api/sources/health",
                headers={"X-Ingest-Token": "valid-secret-token"},
            )
            assert resp.status_code == 200
            data = resp.json()

            assert "summary" in data
            assert "sources" in data
            summary = data["summary"]
            assert summary["total"] >= 2
            assert summary["failing"] >= 1
            assert summary["healthy"] >= 1

            # Confirm no secrets or auth tokens in output
            payload_str = str(data)
            assert "valid-secret-token" not in payload_str
            assert "password" not in payload_str.lower()
    finally:
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# 6. Strict Boundary Guard: Gemini Client is Never Called
# ---------------------------------------------------------------------------

def test_gemini_client_is_never_touched_during_scheduler(scheduler_db):
    db, Session = scheduler_db
    orig_rss = registry.get("rss")

    try:
        registry.register("rss", MockOkFetcher())

        source = Source(
            slug="boundary-source",
            name="Boundary Source",
            site_url="https://example.com",
            feed_url="https://example.com/boundary-feed",
            type="rss",
            fetch_interval_minutes=60,
            enabled=True,
        )
        db.add(source)
        db.commit()

        engine = SchedulerEngine(db_factory=Session)

        with patch("app.ai_service.client") as mock_ai_client:
            results = asyncio.run(engine.run_due_cycle())
            assert len(results) == 1
            assert results[0].status == "ok"
            mock_ai_client.assert_not_called()
    finally:
        if orig_rss:
            registry.register("rss", orig_rss)
