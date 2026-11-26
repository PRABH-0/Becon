"""Bootstrap pipeline helper for production and staging environments (Task S4).

Runs the full initialization sequence in deterministic order:
1. Database migrations (alembic upgrade head)
2. Database seeding (professions, focus topics, official sources)
3. Source fetching (populate raw_items, events, and fallback cards)
4. Synthesis queue (generate grounded Gemini action cards for priority events)

Safe to re-run at any time (all operations are idempotent).
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from alembic.config import Config

from alembic import command
from app.database import SessionLocal
from app.fetchers.runner import run_fetch
from app.seed.seed import seed
from app.synthesize import run_synthesis_queue

logger = logging.getLogger("becon.bootstrap")


def run_migrations() -> None:
    """Run all pending Alembic migrations to head."""
    logger.info("==> [1/4] Running Alembic database migrations to head...")
    ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    alembic_cfg = Config(str(ini_path))
    command.upgrade(alembic_cfg, "head")
    logger.info("Database schema is up to date.")


def run_seeder() -> dict[str, int]:
    """Idempotently seed professions, focus topics, aliases, and sources."""
    logger.info("==> [2/4] Seeding core professions, focus topics, and sources...")
    with SessionLocal() as db:
        stats = seed(db)
    logger.info("Seeding completed: %s", stats)
    return stats


def run_initial_fetch(limit: int | None = 10) -> int:
    """Fetch recent items from active sources."""
    logger.info("==> [3/4] Running source fetchers (limit=%s)...", limit)
    with SessionLocal() as db:
        summaries = run_fetch(db=db, limit=limit)
    new_items = sum(s.new_inserted for s in summaries if hasattr(s, "new_inserted"))
    logger.info("Fetched %d sources, inserted %d new raw items.", len(summaries), new_items)
    return new_items


def run_initial_synthesis(limit: int = 25) -> int:
    """Run production synthesis queue for top-priority events."""
    logger.info("==> [4/4] Executing production synthesis queue (limit=%d)...", limit)
    with SessionLocal() as db:
        res = run_synthesis_queue(db=db, limit=limit)
    logger.info(
        "Synthesis completed: %d synthesized (%d passed, %d flagged, %d skipped).",
        res.synthesized,
        res.passed,
        res.flagged,
        res.skipped,
    )
    return res.synthesized


def bootstrap(
    skip_fetch: bool = False,
    skip_synthesize: bool = False,
    fetch_limit: int | None = 10,
    synthesis_limit: int = 25,
) -> None:
    """Execute complete bootstrap sequence."""
    logger.info("==========================================")
    logger.info("   BECON PRODUCTION BOOTSTRAP RUNNER     ")
    logger.info("==========================================")
    run_migrations()
    run_seeder()
    if not skip_fetch:
        run_initial_fetch(limit=fetch_limit)
    else:
        logger.info("Skipping source fetch step.")
    if not skip_synthesize:
        run_initial_synthesis(limit=synthesis_limit)
    else:
        logger.info("Skipping synthesis queue step.")
    logger.info("==> Bootstrap complete! Backend is ready for live traffic.")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="Becon Production Bootstrap Helper")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip fetching sources")
    parser.add_argument("--skip-synthesize", action="store_true", help="Skip running synthesis queue")
    parser.add_argument("--fetch-limit", type=int, default=10, help="Per-source fetch limit (default: 10)")
    parser.add_argument("--synthesis-limit", type=int, default=25, help="Max cards to synthesize (default: 25)")
    args = parser.parse_args()

    bootstrap(
        skip_fetch=args.skip_fetch,
        skip_synthesize=args.skip_synthesize,
        fetch_limit=args.fetch_limit,
        synthesis_limit=args.synthesis_limit,
    )


if __name__ == "__main__":
    main()
