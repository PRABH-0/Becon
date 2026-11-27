"""Quality-gate evaluation tooling for Becon (Task 4.4a).

Selects top-severity eligible events stratified across categories and sources,
runs existing production grounded synthesis and claim validation, and outputs
a detailed CSV evaluation report for human review.

Does NOT write cards to database unless --persist is explicitly passed.
Supports --dry-run for offline testing without spending Gemini API quota.
Gracefully writes partial CSV and exits 0 on Gemini quota exhaustion.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import os
import sys
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import ai_service
from app.config import settings
from app.database import SessionLocal
from app.models import Card, Event, EventTopic, RawItem
from app.rate_limit import GeminiQuotaExceededError, rate_limiter
from app.validation import (
    MIN_SOURCE_TEXT_LENGTH,
    is_commit_log_only,
    validate_card_content,
)

logger = logging.getLogger("becon.eval_quality")

EVAL_CSV_COLUMNS: list[str] = [
    "event_id",
    "source_name",
    "source_url",
    "source_excerpt",
    "category",
    "what_happened",
    "why_it_matters",
    "how_it_affects_you",
    "what_to_do_next",
    "action_type",
    "validator_verdict",
    "unsupported_claims",
    "retries_used",
    # Reviewer columns for manual review
    "claim_supported",
    "invented_detail",
    "action_sensible",
    "notes",
]

PREFERRED_CATEGORIES: list[str] = [
    "security",
    "release",
    "deprecation",
    "eol",
    "industry",
    "general",
]


class FakeEvalGeminiClient:
    """Fake Gemini client for offline dry-runs and tests that generates grounded cards."""

    def __init__(self, handler=None) -> None:
        self.calls: list[dict[str, Any]] = []
        self._handler = handler
        self.models = self

    def generate_content(self, **kwargs) -> Any:
        self.calls.append(kwargs)
        if self._handler is not None:
            return self._handler(len(self.calls), kwargs)

        # Generate a safe BriefingCardContent JSON string
        contents = str(kwargs.get("contents", ""))
        lines = [line.strip() for line in contents.splitlines() if line.strip()]
        topic = "Technology"
        for line in lines:
            if line.startswith("Tech Tag:"):
                topic = line.replace("Tech Tag:", "").strip()
                break

        title = "Software Update"
        for line in lines:
            if line.startswith("Article Title:"):
                title = line.replace("Article Title:", "").strip()
                break

        # Grounded text from source
        card_data = {
            "what_happened": [f"{title} is announced with operational updates."],
            "why_it_matters": f"Affects operational stability and deployments for {topic} systems.",
            "how_it_affects_you": f"Engineering teams managing {topic} must evaluate breaking changes and update schedules.",
            "what_to_do_next": {
                "action_type": "apply" if "security" in contents.lower() else "learn",
                "guidance": "Review official documentation and test compatibility in staging environments.",
            },
        }
        return SimpleNamespace(text=json.dumps(card_data))


def get_stratified_evaluation_events(
    db: Session,
    limit: int = 30,
    max_per_source: int = 3,
    min_sources: int = 8,
) -> list[Event]:
    """Select eligible events stratified across categories and distinct sources.

    - Must have at least one topic tag (EventTopic).
    - Must have raw_items with sufficient source text (>= MIN_SOURCE_TEXT_LENGTH).
    - Excludes commit-log-only items.
    - Stratified across categories (security, release, deprecation, eol, industry).
    - Aim for at least min_sources distinct sources, capped at max_per_source each.
    - Ordered by severity_score DESC within each stratum.
    """
    has_focus_tag = select(EventTopic.id).where(EventTopic.event_id == Event.id).exists()

    candidates = (
        db.query(Event)
        .options(
            selectinload(Event.raw_items).selectinload(RawItem.source),
            selectinload(Event.event_topics).selectinload(EventTopic.topic),
        )
        .filter(has_focus_tag)
        .order_by(Event.severity_score.desc(), Event.published_at.desc().nullslast())
        .all()
    )

    eligible: list[Event] = []
    for ev in candidates:
        raw = next((r for r in ev.raw_items if (r.summary or r.content_text)), None)
        text = (raw.summary or raw.content_text or "") if raw else ""
        if len(text.strip()) >= MIN_SOURCE_TEXT_LENGTH and not is_commit_log_only(text):
            eligible.append(ev)

    # Group candidates by normalized category
    category_buckets: dict[str, list[Event]] = defaultdict(list)
    for ev in eligible:
        cat = (ev.category or "general").strip().lower()
        category_buckets[cat].append(ev)

    selected: list[Event] = []
    source_counts: dict[uuid.UUID, int] = defaultdict(int)
    seen_event_ids: set[uuid.UUID] = set()

    # Determine ordered category list (preferred list + any other categories present in DB)
    available_cats = [c for c in PREFERRED_CATEGORIES if c in category_buckets]
    for c in category_buckets:
        if c not in available_cats:
            available_cats.append(c)

    # Round-robin selection across categories respecting max_per_source
    progress = True
    while len(selected) < limit and progress:
        progress = False
        for cat in available_cats:
            bucket = category_buckets[cat]
            for ev in bucket:
                if ev.id in seen_event_ids:
                    continue

                raw = next((r for r in ev.raw_items if (r.summary or r.content_text)), None)
                source_id = raw.source_id if raw else None

                # Source quota check
                if source_id is not None and source_counts[source_id] >= max_per_source:
                    continue

                # Add to selection
                selected.append(ev)
                seen_event_ids.add(ev.id)
                if source_id is not None:
                    source_counts[source_id] += 1
                progress = True
                break

            if len(selected) >= limit:
                break

    # If still below limit, fill remaining slots from any eligible candidate respecting max_per_source
    if len(selected) < limit:
        for ev in eligible:
            if ev.id in seen_event_ids:
                continue
            raw = next((r for r in ev.raw_items if (r.summary or r.content_text)), None)
            source_id = raw.source_id if raw else None
            if source_id is not None and source_counts[source_id] >= max_per_source:
                continue
            selected.append(ev)
            seen_event_ids.add(ev.id)
            if source_id is not None:
                source_counts[source_id] += 1
            if len(selected) >= limit:
                break

    # If still below limit (e.g. in small test environments with few sources), relax max_per_source
    if len(selected) < limit:
        for ev in eligible:
            if ev.id in seen_event_ids:
                continue
            selected.append(ev)
            seen_event_ids.add(ev.id)
            if len(selected) >= limit:
                break

    return selected


def format_source_excerpt(raw_text: str, max_chars: int = 300) -> str:
    """Clean and truncate raw source text for the CSV excerpt column."""
    if not raw_text:
        return ""
    collapsed = " ".join(raw_text.strip().split())
    if len(collapsed) > max_chars:
        return collapsed[: max_chars - 3] + "..."
    return collapsed


def evaluate_single_event(
    db: Session,
    event: Event,
    dry_run: bool = False,
    persist: bool = False,
    user_key: str | None = None,
) -> dict[str, Any]:
    """Run production grounded synthesis and claim validation on a single event.

    Reuses existing production code (ai_service and validation modules).
    Does NOT write to cards table unless persist=True.
    """
    raw_item = (
        db.query(RawItem)
        .filter(RawItem.event_id == event.id)
        .order_by(RawItem.fetched_at.asc())
        .first()
    )
    raw_summary = (raw_item.summary or raw_item.content_text or "") if raw_item else ""
    source_name = raw_item.source.name if (raw_item and raw_item.source) else "Unknown"
    source_url = event.canonical_url or (raw_item.url if raw_item else "")

    top_et = (
        db.query(EventTopic)
        .filter(EventTopic.event_id == event.id)
        .order_by(EventTopic.confidence.desc())
        .first()
    )
    effective_tag = top_et.topic.name if top_et and top_et.topic else "General"

    # Pre-flight quota check (raises GeminiQuotaExceededError if exhausted)
    if not dry_run:
        rate_limiter.check_gemini_quota(user_key=user_key)

    # Attempt 1: production grounded synthesis
    card_content = ai_service.generate_action_card(
        article_title=event.canonical_title,
        source_url=event.canonical_url,
        raw_summary=raw_summary,
        tech_tag=effective_tag,
        user_key=user_key,
    )
    val_result = validate_card_content(card_content, raw_summary)
    retries_used = 0

    # Retry once if invalid (reusing synthesize.py production retry pattern)
    if not val_result.is_valid:
        logger.warning(
            "Evaluation validation failed for '%s' (%s). Retrying once...",
            event.canonical_title[:40],
            val_result.notes,
        )
        retries_used = 1
        if not dry_run:
            rate_limiter.check_gemini_quota(user_key=user_key)

        retry_content = ai_service.generate_action_card(
            article_title=event.canonical_title,
            source_url=event.canonical_url,
            raw_summary=raw_summary,
            tech_tag=effective_tag,
            custom_prompt="Previous generation contained claims not in source. Ground strictly on provided source.",
            user_key=user_key,
        )
        val_result_retry = validate_card_content(retry_content, raw_summary)
        if val_result_retry.is_valid:
            card_content = retry_content
            val_result = val_result_retry
        else:
            val_result = val_result_retry

    # Format unsupported claims list
    unsupported_list = []
    if val_result.notes and isinstance(val_result.notes, dict):
        unsupported_list = val_result.notes.get("unsupported_entities", [])
        if not unsupported_list and val_result.notes.get("error"):
            unsupported_list = [str(val_result.notes.get("error"))]
    unsupported_str = "; ".join(unsupported_list) if unsupported_list else "none"

    # Format what_happened bullets
    what_happened_str = "\n".join(f"- {b}" for b in card_content.what_happened)

    # Optional DB persistence
    if persist:
        content_hash = hashlib.sha256((raw_summary or event.canonical_title).encode("utf-8")).hexdigest()
        card = db.query(Card).filter(Card.event_id == event.id).first()
        is_valid = val_result.is_valid
        if card:
            card.what_happened = card_content.what_happened
            card.why_it_matters = card_content.why_it_matters
            card.how_it_affects_you = card_content.how_it_affects_you
            card.action_type = card_content.what_to_do_next.action_type
            card.action_guidance = card_content.what_to_do_next.guidance
            card.source_text_hash = content_hash
            card.model_name = settings.GEMINI_MODEL
            card.validation_status = val_result.status
            card.validation_notes = val_result.notes
            card.status = "published" if is_valid else "draft"
            card.updated_at = datetime.now(UTC)
        else:
            card = Card(
                id=uuid.uuid4(),
                event_id=event.id,
                what_happened=card_content.what_happened,
                why_it_matters=card_content.why_it_matters,
                how_it_affects_you=card_content.how_it_affects_you,
                action_type=card_content.what_to_do_next.action_type,
                action_guidance=card_content.what_to_do_next.guidance,
                source_url=event.canonical_url,
                source_text_hash=content_hash,
                model_name=settings.GEMINI_MODEL,
                prompt_version=ai_service.PROMPT_VERSION,
                validation_status=val_result.status,
                validation_notes=val_result.notes,
                status="published" if is_valid else "draft",
                published_at=event.published_at or datetime.now(UTC),
            )
            db.add(card)
        db.commit()

    return {
        "event_id": str(event.id),
        "source_name": source_name,
        "source_url": source_url,
        "source_excerpt": format_source_excerpt(raw_summary),
        "category": (event.category or "general").strip().lower(),
        "what_happened": what_happened_str,
        "why_it_matters": card_content.why_it_matters,
        "how_it_affects_you": card_content.how_it_affects_you,
        "what_to_do_next": card_content.what_to_do_next.guidance,
        "action_type": card_content.what_to_do_next.action_type,
        "validator_verdict": val_result.status,
        "unsupported_claims": unsupported_str,
        "retries_used": retries_used,
        # Blank reviewer columns for lead review
        "claim_supported": "",
        "invented_detail": "",
        "action_sensible": "",
        "notes": "",
    }


def write_eval_csv(rows: list[dict[str, Any]], out_path: str) -> None:
    """Write evaluation rows to a CSV file."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=EVAL_CSV_COLUMNS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def run_eval_quality(
    limit: int = 30,
    dry_run: bool = False,
    persist: bool = False,
    out_dir: str = "eval_output",
    max_per_source: int = 3,
    min_sources: int = 8,
    db: Session | None = None,
) -> int:
    """Run quality-gate evaluation against stratified events and write CSV."""
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    original_client = ai_service.client

    try:
        events = get_stratified_evaluation_events(
            db,
            limit=limit,
            max_per_source=max_per_source,
            min_sources=min_sources,
        )

        if not events:
            logger.warning("No eligible events found for quality evaluation.")
            print("No eligible events found for quality evaluation.")
            return 0

        # Compute and report mix statistics
        category_counts: dict[str, int] = defaultdict(int)
        source_counts: dict[str, int] = defaultdict(int)
        for ev in events:
            cat = (ev.category or "general").strip().lower()
            category_counts[cat] += 1
            raw = next((r for r in ev.raw_items if r.source), None)
            s_name = raw.source.name if raw and raw.source else "Unknown"
            source_counts[s_name] += 1

        print("=== QUALITY EVALUATION STRATIFIED MIX ===")
        print(f"Total Events Selected: {len(events)} (Target: {limit})")
        print(f"Distinct Sources: {len(source_counts)} (Target: >= {min_sources}, Max/source: {max_per_source})")
        print("\nCategory Breakdown:")
        for cat, cnt in sorted(category_counts.items(), key=lambda x: -x[1]):
            print(f"  - {cat}: {cnt}")
        print("\nSource Breakdown:")
        for src, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
            print(f"  - {src}: {cnt}")
        print("=========================================\n")

        # Prepare output path
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        if out_dir.endswith(".csv"):
            out_path = out_dir
        else:
            out_path = os.path.join(out_dir, f"eval_quality_{timestamp}.csv")

        # Set fake Gemini client for dry-run if live client is unset or requested
        if dry_run and not isinstance(ai_service.client, FakeEvalGeminiClient):
            ai_service.client = FakeEvalGeminiClient()

        rows: list[dict[str, Any]] = []
        passed_count = 0
        flagged_count = 0
        quota_stopped = False

        print(f"Evaluating {len(events)} events (dry_run={dry_run}, persist={persist})...\n")

        for idx, event in enumerate(events, start=1):
            try:
                row = evaluate_single_event(
                    db,
                    event,
                    dry_run=dry_run,
                    persist=persist,
                )
                rows.append(row)
                verdict = row["validator_verdict"]
                if verdict == "passed":
                    passed_count += 1
                else:
                    flagged_count += 1

                print(
                    f"[{idx}/{len(events)}] [{verdict.upper()}] "
                    f"({row['category']}) {event.canonical_title[:50]} (retries: {row['retries_used']})"
                )

            except GeminiQuotaExceededError as e:
                quota_stopped = True
                remaining = len(events) - len(rows)
                logger.warning(
                    "Gemini quota exhausted after %d events; %d events remain deferred: %s",
                    len(rows),
                    remaining,
                    e,
                )
                print(f"\n[QUOTA STOP] Daily Gemini quota reached after {len(rows)} events.")
                print(f"{remaining} events deferred without penalty. Writing partial evaluation CSV...")
                break

        # Write CSV output
        write_eval_csv(rows, out_path)
        print(f"\nEvaluation output written successfully to: {out_path}")
        print(f"Results summary: {len(rows)} evaluated | {passed_count} passed | {flagged_count} flagged")
        if quota_stopped:
            print("Completed cleanly with partial results on quota backoff.")

        return 0

    finally:
        if dry_run:
            ai_service.client = original_client
        if should_close_db:
            db.close()


def main() -> None:
    """CLI entrypoint for python -m app.eval_quality."""
    parser = argparse.ArgumentParser(description="Becon Quality Gate Evaluation Tooling (Task 4.4a)")
    parser.add_argument("--limit", type=int, default=30, help="Number of eligible events to evaluate (default: 30)")
    parser.add_argument("--dry-run", action="store_true", help="Run offline using synthetic fake Gemini without spending quota")
    parser.add_argument("--persist", action="store_true", help="Persist evaluated cards to database (default: False/read-only)")
    parser.add_argument("--out", type=str, default="eval_output", help="Output directory or CSV filepath (default: eval_output)")
    parser.add_argument("--max-per-source", type=int, default=3, help="Maximum events per distinct source (default: 3)")
    parser.add_argument("--min-sources", type=int, default=8, help="Target minimum distinct sources (default: 8)")

    args = parser.parse_args()

    # Never log or print GEMINI_API_KEY
    exit_code = run_eval_quality(
        limit=args.limit,
        dry_run=args.dry_run,
        persist=args.persist,
        out_dir=args.out,
        max_per_source=args.max_per_source,
        min_sources=args.min_sources,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
