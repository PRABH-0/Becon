"""CLI runner for Becon source fetchers.

Usage:
    python -m app.fetchers
    python -m app.fetchers --slugs react-blog,nextjs-releases
    python -m app.fetchers --limit 10
"""

import argparse
import time

from app.database import SessionLocal
from app.fetchers.runner import run_fetch


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Becon official source fetchers.")
    parser.add_argument(
        "--slugs",
        type=str,
        default="",
        help="Comma-separated list of source slugs to fetch (default: all active)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum items to fetch per source (default: source default, typically 30)",
    )
    args = parser.parse_args()

    slugs = [s.strip() for s in args.slugs.split(",") if s.strip()] or None

    print("\n" + "=" * 90)
    print("  BECON OFFICIAL SOURCES FETCHER (Task 2.3)")
    print("=" * 90)
    print(f"Targeting: {'All active sources' if not slugs else ', '.join(slugs)}")
    if args.limit:
        print(f"Per-source item limit: {args.limit}")
    print("=" * 90 + "\n")

    start_all = time.time()
    db = SessionLocal()
    try:
        summaries = run_fetch(db=db, source_slugs=slugs, limit=args.limit)
    finally:
        db.close()

    total_duration = time.time() - start_all

    # Print summary table
    print("\n" + "-" * 115)
    print(
        f"{'Slug':<26} | {'Status':<12} | {'Fetched':<8} | {'Inserted':<9} | {'Skipped':<8} | {'Time (s)':<8} | {'Error'}"
    )
    print("-" * 115)

    total_fetched = 0
    total_inserted = 0
    total_skipped = 0

    for s in summaries:
        total_fetched += s.items_fetched
        total_inserted += s.new_inserted
        total_skipped += s.duplicates_skipped
        err_display = (s.error or "")[:35]
        print(
            f"{s.slug:<26} | {s.status:<12} | {s.items_fetched:<8} | {s.new_inserted:<9} | {s.duplicates_skipped:<8} | {s.duration_seconds:<8.2f} | {err_display}"
        )

    print("-" * 115)
    print(
        f"TOTALS: {len(summaries)} sources | Fetched: {total_fetched} | Inserted: {total_inserted} | Duplicates: {total_skipped} | Wall Time: {total_duration:.2f}s\n"
    )


if __name__ == "__main__":
    main()
