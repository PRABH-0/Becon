"""Production synthesis queue runner and CLI for Becon (Task F3.1, S2).

Selects events eligible for a briefing published in the last 14 days:
- Must have at least one focus topic tag
- Ordered by (severity_score DESC, published_at DESC, topic_count DESC)
- Older events or untagged events stay as fallback cards and are not queued or shown in production.

Synthesizes highest priority events first using Google Gemini with structured outputs,
validating source grounding and claim fidelity.
Skips events that already have a validated Gemini card.
Respects INGEST_MAX_GEMINI_CALLS_PER_RUN and global daily caps.
Backs off cleanly on Gemini quota/rate limits without marking cards flagged.
"""

from __future__ import annotations

import argparse
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import List, Tuple

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import ai_service
from app.briefing_service import is_prerelease
from app.config import settings
from app.database import SessionLocal
from app.models import Card, Event, EventTopic, RawItem
from app.rate_limit import GeminiQuotaExceededError, rate_limiter
from app.validation import is_commit_log_only, is_source_text_sufficient, validate_card_content

logger = logging.getLogger("becon.synthesize")


@dataclass
class SynthesisResult:
    queue_size: int = 0
    synthesized: int = 0
    passed: int = 0
    flagged: int = 0
    skipped: int = 0
    quota_remaining: int = 0


def get_synthesis_queue(
    db: Session,
    now: datetime | None = None,
    days: int = 14,
) -> List[Event]:
    """Query eligible events for synthesis ordered by (severity DESC, published_at DESC, topic_count DESC).

    Restricted to events from the last 14 days that have at least one focus tag.
    Older events or untagged events stay as fallback cards and are not queued.
    """
    current_time = now or datetime.now(UTC)
    cutoff = current_time - timedelta(days=days)

    validated_gemini_events = (
        select(Card.event_id)
        .where(
            Card.validation_status == "passed",
            Card.model_name != "fallback-heuristic",
        )
        .scalar_subquery()
    )

    topic_count_subq = (
        select(func.count(EventTopic.id))
        .where(EventTopic.event_id == Event.id)
        .scalar_subquery()
    )

    time_cond = or_(
        Event.published_at >= cutoff,
        and_(Event.published_at.is_(None), Event.first_seen_at >= cutoff),
    )

    # Must have at least one focus tag
    has_focus_tag = select(EventTopic.id).where(EventTopic.event_id == Event.id).exists()

    query = (
        db.query(Event)
        .options(selectinload(Event.raw_items))
        .filter(
            time_cond,
            has_focus_tag,
            Event.id.not_in(validated_gemini_events),
        )
        .order_by(
            Event.severity_score.desc(),
            Event.published_at.desc(),
            topic_count_subq.desc(),
        )
    )

    candidates = query.all()

    # Determine which sources have at least one stable (non-prerelease) candidate
    sources_with_stable: set[uuid.UUID] = set()
    for ev in candidates:
        if not is_prerelease(ev.canonical_title):
            for raw in ev.raw_items:
                if raw.source_id:
                    sources_with_stable.add(raw.source_id)

    # Exclude prereleases from the queue if a stable candidate exists for that source
    filtered_queue: list[Event] = []
    for ev in candidates:
        if is_prerelease(ev.canonical_title):
            ev_sources = {raw.source_id for raw in ev.raw_items if raw.source_id}
            # If any source for this prerelease has a stable candidate, skip it
            if ev_sources and any(s_id in sources_with_stable for s_id in ev_sources):
                continue
        filtered_queue.append(ev)

    return filtered_queue


def synthesize_event_card(
    db: Session,
    event: Event,
    user_key: str | None = None,
) -> Tuple[Card | None, str]:
    """Synthesize and validate a single event card using Gemini.

    Returns:
        (Card, "passed" | "flagged" | "skipped")
    """
    raw_item = (
        db.query(RawItem)
        .filter(RawItem.event_id == event.id)
        .order_by(RawItem.fetched_at.asc())
        .first()
    )
    raw_summary = (raw_item.summary or raw_item.content_text or "") if raw_item else ""
    if not raw_summary:
        return None, "skipped"

    # Check text sufficiency (> ~200 chars)
    is_sufficient, short_reason = is_source_text_sufficient(raw_summary)
    if not is_sufficient:
        logger.info("Source too short for event %s: %s", event.canonical_title[:40], short_reason)
        return None, "skipped"

    # Check commit-log-only without prose (Task 3)
    if is_commit_log_only(raw_summary):
        logger.info("Source text is commit-log-only with no prose for event %s; skipping card generation", event.canonical_title[:40])
        return None, "skipped"

    # Effective topic tag
    top_et = (
        db.query(EventTopic)
        .filter(EventTopic.event_id == event.id)
        .order_by(EventTopic.confidence.desc())
        .first()
    )
    effective_tag = top_et.topic.name if top_et and top_et.topic else "General"

    # Pre-flight check quota
    rate_limiter.check_gemini_quota(user_key=user_key)

    # Attempt 1
    card_content = ai_service.generate_action_card(
        article_title=event.canonical_title,
        source_url=event.canonical_url,
        raw_summary=raw_summary,
        tech_tag=effective_tag,
        user_key=user_key,
    )
    val_result = validate_card_content(card_content, raw_summary)

    # Retry once if invalid
    if not val_result.is_valid:
        logger.warning(
            "Synthesis validation failed for '%s': %s. Retrying once...",
            event.canonical_title[:40],
            val_result.notes,
        )
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

    # Upsert Card
    import hashlib
    content_hash = hashlib.sha256((raw_summary or event.canonical_title).encode("utf-8")).hexdigest()
    card = db.query(Card).filter(Card.event_id == event.id).first()
    is_valid = val_result.is_valid
    status_str = "passed" if is_valid else "flagged"

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
    return card, status_str


def run_synthesis_queue(
    db: Session | None = None,
    limit: int | None = None,
    dry_run: bool = False,
    now: datetime | None = None,
) -> SynthesisResult:
    """Run production synthesis queue up to limit or daily global cap."""
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    try:
        events = get_synthesis_queue(db, now=now)
        queue_size = len(events)
        quota_remaining = rate_limiter.get_global_gemini_remaining()

        if dry_run:
            logger.info("Dry run: %d eligible events found in synthesis queue", queue_size)
            return SynthesisResult(
                queue_size=queue_size,
                synthesized=0,
                passed=0,
                flagged=0,
                skipped=0,
                quota_remaining=quota_remaining,
            )

        effective_limit = limit if limit is not None else settings.INGEST_MAX_GEMINI_CALLS_PER_RUN
        synthesized_count = 0
        passed_count = 0
        flagged_count = 0
        skipped_count = 0

        for event in events:
            if synthesized_count >= effective_limit:
                logger.info("Reached per-run synthesis limit of %d", effective_limit)
                break

            try:
                rate_limiter.check_gemini_quota()
            except GeminiQuotaExceededError as e:
                logger.warning("Synthesis queue halting cleanly on quota limit: %s", e)
                break

            try:
                card, outcome = synthesize_event_card(db, event)
                if outcome == "skipped":
                    skipped_count += 1
                    continue

                synthesized_count += 1
                if outcome == "passed":
                    passed_count += 1
                elif outcome == "flagged":
                    flagged_count += 1

            except GeminiQuotaExceededError as e:
                logger.warning("Synthesis queue hit quota during card generation: %s. Halting cleanly.", e)
                break
            except Exception as e:
                err_str = str(e).lower()
                if "429" in err_str or "quota" in err_str or "resource_exhausted" in err_str:
                    logger.warning("Gemini 429 / resource exhausted error: %s. Backing off cleanly.", e)
                    break
                logger.error("Error synthesizing card for event %s: %s", event.canonical_title[:40], e)
                db.rollback()
                continue

        quota_remaining = rate_limiter.get_global_gemini_remaining()
        return SynthesisResult(
            queue_size=queue_size,
            synthesized=synthesized_count,
            passed=passed_count,
            flagged=flagged_count,
            skipped=skipped_count,
            quota_remaining=quota_remaining,
        )
    finally:
        if should_close_db:
            db.close()


def print_synthesis_summary(result: SynthesisResult) -> None:
    """Print standard synthesis queue summary to stdout."""
    print("\n=== BECON PRODUCTION SYNTHESIS QUEUE ===")
    print(f"Queue Size:       {result.queue_size}")
    print(f"Synthesized:      {result.synthesized}")
    print(f"Passed:           {result.passed}")
    print(f"Flagged:          {result.flagged}")
    print(f"Skipped:          {result.skipped}")
    print(f"Quota Remaining:  {result.quota_remaining}")
    print("=" * 40 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Becon Production Synthesis Queue Runner")
    parser.add_argument("--limit", type=int, default=None, help="Max cards to synthesize in this run")
    parser.add_argument("--dry-run", action="store_true", help="Calculate queue without calling Gemini or writing DB")
    args = parser.parse_args()

    result = run_synthesis_queue(limit=args.limit, dry_run=args.dry_run)
    print_synthesis_summary(result)


if __name__ == "__main__":
    main()
