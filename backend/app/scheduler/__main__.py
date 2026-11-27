"""CLI entrypoint for the Becon source scheduler worker.

Usage:
    python -m app.scheduler           # Continuous background worker loop
    python -m app.scheduler --once    # Run currently due sources once and exit
    python -m app.scheduler --status  # Print source health status table
"""

import argparse
import asyncio
import logging
import signal
import sys
from datetime import datetime

from app.config import settings
from app.database import SessionLocal
from app.logging_config import setup_logging
from app.models import Source
from app.scheduler.service import SchedulerEngine

logger = logging.getLogger("becon.scheduler.cli")


def format_iso(dt: datetime | None) -> str:
    if not dt:
        return "never"
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def print_status_table() -> None:
    """Print the source health status table to stdout."""
    db = SessionLocal()
    try:
        try:
            sources = db.query(Source).order_by(Source.slug.asc()).all()
        except Exception as e:
            print(f"\nCould not query sources (database may not be initialized): {e}")
            print("Run 'dev.ps1 migrate' and 'dev.ps1 seed' first.\n")
            return
        total = len(sources)
        healthy = sum(1 for s in sources if s.status == "healthy")
        degraded = sum(1 for s in sources if s.status == "degraded")
        failing = sum(1 for s in sources if s.status == "failing")
        never_fetched = sum(1 for s in sources if s.last_fetched_at is None)

        last_successful = [s.last_success_at for s in sources if s.last_success_at is not None]
        last_success_time = max(last_successful) if last_successful else None
        oldest_success_time = min(last_successful) if last_successful else None

        print("\n=== BECON SOURCE HEALTH SUMMARY ===")
        print(f"Total Sources:         {total}")
        print(f"Healthy:               {healthy}")
        print(f"Degraded:              {degraded}")
        print(f"Failing:               {failing}")
        print(f"Never Fetched:         {never_fetched}")
        print(f"Last Success Time:     {format_iso(last_success_time)}")
        print(f"Oldest Last Success:   {format_iso(oldest_success_time)}")
        print("=" * 36)

        header = f"{'SLUG':<28} | {'EN':<3} | {'STATUS':<9} | {'LAST FETCH':<19} | {'LAST SUCCESS':<19} | {'FAIL':<4} | {'NEXT FETCH':<19} | {'LAST ERROR'}"
        print("\n" + header)
        print("-" * len(header))

        for s in sources:
            en_str = "yes" if s.enabled else "no"
            err = (s.last_error or "")[:30]
            print(
                f"{s.slug:<28} | {en_str:<3} | {s.status:<9} | {format_iso(s.last_fetched_at):<19} | "
                f"{format_iso(s.last_success_at):<19} | {s.consecutive_failures:<4} | "
                f"{format_iso(s.next_fetch_at):<19} | {err}"
            )
        print()
    finally:
        db.close()


def print_run_summary(results: list) -> None:
    """Print results of a --once run cycle."""
    if not results:
        print("\nNo sources were due for fetching.\n")
        return

    print("\n=== RUN SUMMARY ===")
    header = f"{'SLUG':<28} | {'STATUS':<12} | {'FETCHED':<7} | {'INSERTED':<8} | {'DURATION':<8} | {'NEXT FETCH'}"
    print(header)
    print("-" * len(header))

    for r in results:
        next_f = format_iso(r.next_fetch_at)
        dur = f"{r.duration_seconds:.2f}s"
        print(
            f"{r.slug:<28} | {r.status:<12} | {r.items_fetched:<7} | "
            f"{r.new_inserted:<8} | {dur:<8} | {next_f}"
        )
        if r.error:
            print(f"  Error: {r.error}")
    print()


async def main_async() -> int:
    parser = argparse.ArgumentParser(description="Becon Source Scheduler Worker")
    parser.add_argument("--once", action="store_true", help="Run due sources once and exit")
    parser.add_argument("--status", action="store_true", help="Print source health table and exit")
    parser.add_argument("--limit", type=int, default=None, help="Item limit per source fetch")
    parser.add_argument(
        "--tick-seconds",
        type=int,
        default=getattr(settings, "SCHEDULER_TICK_SECONDS", 10),
        help="Polling tick interval in seconds",
    )
    args = parser.parse_args()

    if args.status:
        print_status_table()
        return 0

    if not getattr(settings, "SCHEDULER_ENABLED", True):
        logger.info("Scheduler execution skipped: SCHEDULER_ENABLED is False")
        print("Scheduler disabled: SCHEDULER_ENABLED is False.")
        return 0

    engine = SchedulerEngine()

    if args.once:
        print("Executing single scheduler due cycle (--once)...")
        results = await engine.run_due_cycle(limit=args.limit)
        print_run_summary(results)
        return 0

    # Continuous worker loop
    stop_event = asyncio.Event()

    def signal_handler(*_) -> None:
        logger.info("Shutdown signal caught, terminating scheduler...")
        stop_event.set()

    # Register OS signals
    if sys.platform != "win32":
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, signal_handler)
    else:
        # On Windows, register via standard signal module
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    print("Becon Scheduler Worker started. Press Ctrl+C to terminate.")
    await engine.run_continuous(
        tick_seconds=args.tick_seconds,
        stop_event=stop_event,
        limit=args.limit,
    )
    return 0


def main() -> None:
    setup_logging(environment=settings.ENVIRONMENT, log_level=settings.LOG_LEVEL)
    try:
        exit_code = asyncio.run(main_async())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nScheduler worker stopped by user.")
        sys.exit(0)


if __name__ == "__main__":
    main()
