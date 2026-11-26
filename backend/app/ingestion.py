"""Idempotent feed ingestion and event-card persistence pipeline for Becon.

Replaces in-memory caches by persisting:
1. Sources: registry of external feeds with fetch timestamps, error isolation, and failure counts.
2. Raw Items: raw parsed items uniquely keyed by (source_id, url_hash).
3. Events: deduplicated canonical occurrences merged across sources by URL and title.
4. Cards: shared 4-part canonical Action Cards (one per event).
5. Card Variants: lazy profession- and topic-personalized variants cached in the database.
"""

import hashlib
import html
import logging
import re
import urllib.parse
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import List, Tuple

import feedparser
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import app.ai_service as ai_service
from app.ai_service import MODEL_NAME, PROMPT_VERSION, generate_action_card
from app.classification import (
    calculate_severity_score,
    normalize_event_title,
    populate_event_topics,
)
from app.classification import (
    classify_event_category as classification_classify_category,
)
from app.config import settings
from app.models import (
    Card,
    CardVariant,
    Event,
    EventTopic,
    FocusTopic,
    Profession,
    RawItem,
    Source,
)
from app.rate_limit import GeminiQuotaExceededError
from app.validation import is_source_text_sufficient, validate_card_content

logger = logging.getLogger("becon.ingestion")


@dataclass
class IngestionStats:
    sources_fetched: int = 0
    raw_items_new: int = 0
    raw_items_duplicate: int = 0
    events_created: int = 0
    cards_created: int = 0
    errors: int = 0
    gemini_calls_used: int = 0
    raw_items_deferred: int = 0
    budget_reached_logged: bool = False


def normalize_url(url: str) -> str:
    """Normalize URL by lowercasing scheme/host, stripping tracking params and fragments."""
    if not url:
        return ""
    clean = url.strip()
    try:
        parsed = urllib.parse.urlparse(clean)
        # Filter tracking query parameters
        tracking_params = {
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "fbclid",
            "gclid",
            "ref",
            "source",
        }
        filtered_queries = []
        if parsed.query:
            for pair in parsed.query.split("&"):
                if pair:
                    k = pair.split("=")[0].lower()
                    if k not in tracking_params:
                        filtered_queries.append(pair)
        new_query = "&".join(filtered_queries)

        path = parsed.path.rstrip("/")
        if not path and parsed.netloc:
            path = "/"

        return urllib.parse.urlunparse(
            (
                parsed.scheme.lower() or "https",
                parsed.netloc.lower(),
                path or "/",
                parsed.params,
                new_query,
                "",  # strip fragment
            )
        )
    except Exception:
        return clean


def compute_hash(text: str) -> str:
    """Compute deterministic SHA-256 hex digest of normalized text."""
    return hashlib.sha256(text.strip().lower().encode("utf-8")).hexdigest()


def sanitize_text(text: str | None, max_length: int = 2000) -> str:
    """Strip HTML, unescape entities, collapse whitespace, and truncate safely."""
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]+>", " ", text)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:max_length]


def classify_event_category(
    title: str,
    summary: str = "",
    source_type: str = "",
    source_slug: str = "",
) -> str:
    """Classify event into category: release, deprecation, security, eol, industry."""
    cat, _ = classification_classify_category(
        title=title,
        text=summary,
        source_type=source_type,
        source_slug=source_slug,
    )
    return cat


def evaluate_severity_score(
    category: str,
    title: str,
    summary: str,
    is_breaking: bool = False,
    raw_metadata: dict | None = None,
    source_slug: str = "",
    published_at: datetime | None = None,
    matched_topics_count: int = 0,
) -> int:
    """Calculate severity score 0-100 based on event category, metadata, and impact markers."""
    return calculate_severity_score(
        category=category,
        is_breaking=is_breaking,
        raw_metadata=raw_metadata,
        source_slug=source_slug,
        published_at=published_at,
        matched_topics_count=matched_topics_count,
        text=f"{title} {summary}",
    )


def get_or_create_source(
    db: Session,
    feed_url: str,
    name: str,
    site_url: str = "",
) -> Source:
    """Idempotently fetch or create a registered Source row."""
    source = db.query(Source).filter(Source.feed_url == feed_url).first()
    if source:
        return source

    clean_slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not clean_slug:
        clean_slug = f"source-{uuid.uuid4().hex[:8]}"

    existing_slug = db.query(Source).filter(Source.slug == clean_slug).first()
    if existing_slug:
        clean_slug = f"{clean_slug}-{uuid.uuid4().hex[:6]}"

    if not site_url:
        try:
            parsed = urllib.parse.urlparse(feed_url)
            site_url = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            site_url = "https://becon.dev"

    source = Source(
        slug=clean_slug,
        name=name,
        site_url=site_url,
        feed_url=feed_url,
        type="rss",
        trust_tier=3,
        fetch_interval_minutes=60,
        enabled=True,
        language="en",
    )
    db.add(source)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        source = db.query(Source).filter(Source.feed_url == feed_url).first()
    return source


def process_raw_item_entry(
    db: Session,
    source: Source,
    raw_data: dict,
    tag_name: str,
    stats: IngestionStats,
    max_gemini_calls: int | None = None,
    user_key: str | None = None,
) -> Card | None:
    """Process a single parsed feed entry through RawItem, Event dedup, and Card creation.

    When Gemini is active and `max_gemini_calls` is reached, newly fetched items remain
    persisted as `raw_items` with `status='new'` for processing in a subsequent run.
    """
    raw_title = sanitize_text(raw_data.get("title", ""), max_length=1000)
    raw_url = raw_data.get("link", "").strip()
    raw_summary = sanitize_text(raw_data.get("summary", ""), max_length=3000)

    if not raw_title or not raw_url:
        return None

    norm_url = normalize_url(raw_url)
    url_hash = compute_hash(norm_url)
    content_hash = compute_hash(raw_summary or raw_title)

    # 1. Check idempotency on RawItem (source_id + url_hash)
    existing_raw = db.query(RawItem).filter(
        RawItem.source_id == source.id,
        RawItem.url_hash == url_hash,
    ).first()

    if existing_raw:
        if existing_raw.status != "new" or existing_raw.event_id is not None:
            stats.raw_items_duplicate += 1
            return None
        raw_item = existing_raw
        pub_dt = existing_raw.published_at or datetime.now(UTC)
    else:
        # Parse published timestamp
        pub_dt = None
        if raw_data.get("published_at"):
            try:
                pub_dt = datetime.strptime(raw_data["published_at"], "%b %d, %Y").replace(tzinfo=UTC)
            except Exception:
                pub_dt = datetime.now(UTC)
        else:
            pub_dt = datetime.now(UTC)

        raw_item = RawItem(
            source_id=source.id,
            url=norm_url,
            url_hash=url_hash,
            title=raw_title,
            summary=raw_summary,
            content_text=raw_data.get("content_raw") or raw_summary,
            content_hash=content_hash,
            published_at=pub_dt,
            fetched_at=datetime.now(UTC),
            status="new",
        )
        db.add(raw_item)
        db.flush()
        stats.raw_items_new += 1

    return process_raw_item(
        db=db,
        raw_item=raw_item,
        tag_name=tag_name,
        stats=stats,
        max_gemini_calls=max_gemini_calls,
        user_key=user_key,
    )


def process_raw_item(
    db: Session,
    raw_item: RawItem,
    tag_name: str = "",
    stats: IngestionStats | None = None,
    max_gemini_calls: int | None = None,
    user_key: str | None = None,
) -> Card | None:
    """Bridge a single RawItem into a deduplicated Event and canonical Card."""
    if raw_item.status != "new" and raw_item.event_id is not None:
        if stats:
            stats.raw_items_duplicate += 1
        return db.query(Card).filter(Card.event_id == raw_item.event_id).first()

    norm_url = raw_item.url
    raw_title = raw_item.title
    raw_summary = raw_item.summary or ""
    content_hash = raw_item.content_hash or compute_hash(raw_summary or raw_title)
    pub_dt = raw_item.published_at or datetime.now(UTC)

    src = raw_item.source
    src_primary_topic = (
        src.source_topics[0].topic.name
        if (src and src.source_topics and src.source_topics[0].topic)
        else None
    )
    src_name = src.name if src else None

    normalized_title = normalize_event_title(
        raw_title,
        source_name=src_name,
        primary_topic=src_primary_topic,
    )

    # 1. Exact Deduplication into Events
    # Check 1: exact normalized URL across all sources
    event = db.query(Event).filter(Event.canonical_url == norm_url).first()

    # Check 2: exact normalized title across all sources
    if not event:
        title_lower = normalized_title.lower()
        event = db.query(Event).filter(
            (func.lower(Event.canonical_title) == title_lower)
            | (func.lower(Event.canonical_title) == raw_title.lower())
        ).first()

    existing_card = db.query(Card).filter(Card.event_id == event.id).first() if event else None
    if (
        existing_card is None
        and ai_service.client is not None
        and max_gemini_calls is not None
        and stats is not None
        and stats.gemini_calls_used >= max_gemini_calls
    ):
        stats.raw_items_deferred += 1
        if not stats.budget_reached_logged:
            logger.warning(
                "Ingest per-run Gemini budget (%d) reached; remaining items stay as raw_items (status='new') for the next run.",
                max_gemini_calls,
            )
            stats.budget_reached_logged = True
        return None

    if event:
        # Deduplicated into existing event
        raw_item.event_id = event.id
        db.flush()
    else:
        src_type = raw_item.source.type if raw_item.source else ""
        src_slug = raw_item.source.slug if raw_item.source else ""
        cat, is_breaking = classification_classify_category(
            title=normalized_title,
            text=raw_summary,
            source_type=src_type,
            source_slug=src_slug,
        )

        event = Event(
            canonical_title=normalized_title,
            canonical_url=norm_url,
            category=cat,
            severity_score=50,
            is_breaking=is_breaking,
            first_seen_at=datetime.now(UTC),
            published_at=pub_dt,
            status="published",
        )
        db.add(event)
        db.flush()
        raw_item.event_id = event.id
        db.flush()
        if stats:
            stats.events_created += 1

        # Populate FocusTopic matches via classification tagger
        matched_topics = populate_event_topics(
            db=db,
            event=event,
            raw_item=raw_item,
            source=raw_item.source,
        )

        # Fallback to tag_name if no topics matched
        if not matched_topics and tag_name:
            tag_slug = re.sub(r"[^a-z0-9]+", "-", tag_name.lower()).strip("-")
            topic = db.query(FocusTopic).filter(
                (FocusTopic.slug == tag_slug) | (func.lower(FocusTopic.name) == tag_name.lower())
            ).first()
            if not topic:
                topic = FocusTopic(slug=tag_slug, name=tag_name, kind="topic")
                db.add(topic)
                db.flush()

            existing_et = db.query(EventTopic).filter(
                EventTopic.event_id == event.id,
                EventTopic.topic_id == topic.id,
            ).first()
            if not existing_et:
                db.add(EventTopic(event_id=event.id, topic_id=topic.id, confidence=0.70))
                db.flush()
                matched_topics = [(topic.id, None, 0.70)]

        # Calculate severity score with matched topics count and metadata
        sev = calculate_severity_score(
            category=cat,
            is_breaking=is_breaking,
            raw_metadata=raw_item.raw_metadata,
            source_slug=src_slug,
            published_at=pub_dt,
            matched_topics_count=len(matched_topics),
            text=f"{normalized_title} {raw_summary}",
        )
        event.severity_score = sev
        db.flush()

    # 2. Create Shared Canonical Card (1 per event)
    card = existing_card or db.query(Card).filter(Card.event_id == event.id).first()
    if not card:
        effective_tag = tag_name
        if not effective_tag:
            # Check event topics first
            top_et = (
                db.query(EventTopic)
                .filter(EventTopic.event_id == event.id)
                .order_by(EventTopic.confidence.desc())
                .first()
            )
            if top_et and top_et.topic:
                effective_tag = top_et.topic.name

        if not effective_tag and raw_item.source and getattr(raw_item.source, "source_topics", None):
            for st in raw_item.source.source_topics:
                if getattr(st, "topic", None):
                    effective_tag = st.topic.name
                    break
        if not effective_tag:
            effective_tag = "General"

        # Check source text length (> ~200 chars)
        is_sufficient, short_reason = is_source_text_sufficient(raw_summary)
        active_client = (ai_service.client is not None) or (ai_service.get_gemini_client() is not None)

        if not is_sufficient:
            # Too-short source text -> unvalidated fallback, no Gemini call
            logger.info("Skipping Gemini call for '%s': %s", event.canonical_title[:40], short_reason)
            clean_headline = event.canonical_title.split(" - ")[0].strip() if " - " in event.canonical_title else event.canonical_title.strip()
            fallback_bullets = ai_service.extract_rich_fallback_bullets(raw_summary, clean_headline, effective_tag)
            from app.schemas import ActionGuidance, BriefingCardContent
            card_content = BriefingCardContent(
                what_happened=fallback_bullets,
                why_it_matters=f"Directly impacts operational workflows and standards across {effective_tag}.",
                how_it_affects_you=f"Tracking updates in {clean_headline} enables you to optimize workflows.",
                what_to_do_next=ActionGuidance(action_type="apply", guidance=f"Review official notes for {clean_headline}."),
            )
            val_status = "flagged"
            card_status = "draft"
            val_notes = {
                "reason": "source_too_short",
                "detail": short_reason,
                "length": len(raw_summary.strip()) if raw_summary else 0,
            }
            model_name = "fallback-heuristic"
        elif not active_client:
            card_content = generate_action_card(
                article_title=event.canonical_title,
                source_url=event.canonical_url,
                raw_summary=raw_summary,
                tech_tag=effective_tag,
                user_key=user_key,
            )
            val_status = "unvalidated"
            card_status = "draft" if settings.ENVIRONMENT != "development" else "published"
            val_notes = {"reason": "fallback_no_gemini_client"}
            model_name = "fallback-heuristic"
        else:
            # Active Gemini client: Call Gemini + Validate + Retry once if invalid
            card_content = generate_action_card(
                article_title=event.canonical_title,
                source_url=event.canonical_url,
                raw_summary=raw_summary,
                tech_tag=effective_tag,
                user_key=user_key,
            )
            if stats:
                stats.gemini_calls_used += 1

            val_result = validate_card_content(card_content, raw_summary)
            if not val_result.is_valid:
                logger.warning(
                    "Card validation failed on attempt 1 for '%s': %s. Retrying once...",
                    event.canonical_title[:40],
                    val_result.notes,
                )
                retry_content = generate_action_card(
                    article_title=event.canonical_title,
                    source_url=event.canonical_url,
                    raw_summary=raw_summary,
                    tech_tag=effective_tag,
                    custom_prompt="Previous generation contained claims not in source. Ground strictly on provided source.",
                    user_key=user_key,
                )
                if stats:
                    stats.gemini_calls_used += 1

                val_result_retry = validate_card_content(retry_content, raw_summary)
                if val_result_retry.is_valid:
                    card_content = retry_content
                    val_result = val_result_retry
                else:
                    val_result = val_result_retry

            model_name = settings.GEMINI_MODEL
            val_status = val_result.status
            val_notes = val_result.notes
            card_status = "published" if val_result.is_valid else "draft"

        card = Card(
            event_id=event.id,
            what_happened=card_content.what_happened,
            why_it_matters=card_content.why_it_matters,
            how_it_affects_you=card_content.how_it_affects_you,
            action_type=card_content.what_to_do_next.action_type,
            action_guidance=card_content.what_to_do_next.guidance,
            source_url=event.canonical_url,
            source_text_hash=content_hash,
            model_name=model_name,
            prompt_version=PROMPT_VERSION if active_client and is_sufficient else "1.0",
            validation_status=val_status,
            validation_notes=val_notes,
            published_at=event.published_at or datetime.now(UTC),
            status=card_status,
        )
        db.add(card)
        db.flush()
        if stats:
            stats.cards_created += 1

    raw_item.status = "processed"
    db.flush()
    return card


def process_unprocessed_raw_items(
    db: Session,
    stats: IngestionStats | None = None,
    max_gemini_calls: int | None = None,
    limit: int | None = None,
    source_id: uuid.UUID | None = None,
) -> IngestionStats:
    """Process pending raw_items (status='new') into Events and Cards, newest items first."""
    if stats is None:
        stats = IngestionStats()

    effective_budget = (
        settings.INGEST_MAX_GEMINI_CALLS_PER_RUN
        if max_gemini_calls is None
        else max_gemini_calls
    )

    query = db.query(RawItem).filter(RawItem.status == "new")
    if source_id:
        query = query.filter(RawItem.source_id == source_id)

    query = query.order_by(RawItem.published_at.desc().nullslast(), RawItem.fetched_at.desc())
    if limit:
        query = query.limit(limit)

    raw_items = query.all()
    for raw in raw_items:
        try:
            process_raw_item(
                db=db,
                raw_item=raw,
                stats=stats,
                max_gemini_calls=effective_budget,
            )
            db.commit()
        except GeminiQuotaExceededError as qe:
            db.rollback()
            logger.warning(
                "Gemini daily quota or rate limit exceeded: %s. Leaving remaining raw_items pending.",
                qe,
            )
            break
        except Exception as e:
            db.rollback()
            logger.error(f"Error processing raw_item {raw.id}: {e}")
            stats.errors += 1

    return stats


def backfill_synthesize_cards(
    db: Session,
    limit: int | None = None,
    days: int = 30,
    user_key: str | None = None,
) -> dict[str, int]:
    """Backfill / regenerate cards for existing fallback-heuristic cards, newest-first.

    Only targets items published in the last `days` days.
    Capped by `limit` or `settings.INGEST_MAX_GEMINI_CALLS_PER_RUN`.
    Superseded fallback cards stay draft.
    """
    cutoff = datetime.now(UTC) - timedelta(days=days)
    max_calls = (
        settings.INGEST_MAX_GEMINI_CALLS_PER_RUN
        if limit is None
        else limit
    )

    query = (
        db.query(Card, Event, RawItem)
        .join(Event, Card.event_id == Event.id)
        .outerjoin(RawItem, RawItem.event_id == Event.id)
        .filter(
            Card.model_name == "fallback-heuristic",
            (Event.published_at >= cutoff) | (Card.created_at >= cutoff),
        )
        .order_by(Event.published_at.desc().nullslast(), Card.created_at.desc())
    )
    if max_calls:
        query = query.limit(max_calls)

    candidates = query.all()
    summary = {
        "candidates": len(candidates),
        "synthesized": 0,
        "flagged": 0,
        "skipped_short": 0,
        "errors": 0,
    }

    active_client = ai_service.get_gemini_client()
    if not active_client:
        logger.error("Cannot run backfill synthesis: GEMINI_API_KEY is not configured or Gemini client is inactive.")
        return summary

    logger.info(
        "Starting backfill synthesis across %d candidate cards (limit=%s, days=%d)...",
        len(candidates),
        max_calls,
        days,
    )

    for card, event, raw_item in candidates:
        raw_text = ""
        if raw_item:
            raw_text = raw_item.content_text or raw_item.summary or ""
        if not raw_text:
            raw_text = card.why_it_matters or event.canonical_title

        is_sufficient, short_reason = is_source_text_sufficient(raw_text)
        if not is_sufficient:
            logger.info("Card %s source text too short (%s). Marking flagged.", card.id, short_reason)
            card.validation_status = "flagged"
            card.status = "draft"
            card.validation_notes = {
                "reason": "source_too_short",
                "detail": short_reason,
                "length": len(raw_text.strip()) if raw_text else 0,
            }
            db.commit()
            summary["skipped_short"] += 1
            continue

        effective_tag = "General"
        if raw_item and raw_item.source and getattr(raw_item.source, "source_topics", None):
            for st in raw_item.source.source_topics:
                if getattr(st, "topic", None):
                    effective_tag = st.topic.name
                    break

        try:
            # 1. Call Gemini
            card_content = generate_action_card(
                article_title=event.canonical_title,
                source_url=event.canonical_url,
                raw_summary=raw_text,
                tech_tag=effective_tag,
                user_key=user_key,
            )

            # 2. Validate
            val_result = validate_card_content(card_content, raw_text)

            # Retry once on failure
            if not val_result.is_valid:
                logger.warning(
                    "Backfill card validation failed on attempt 1 for '%s': %s. Retrying once...",
                    event.canonical_title[:40],
                    val_result.notes,
                )
                retry_content = generate_action_card(
                    article_title=event.canonical_title,
                    source_url=event.canonical_url,
                    raw_summary=raw_text,
                    tech_tag=effective_tag,
                    custom_prompt="Previous generation contained claims not in source. Ground strictly on provided source.",
                    user_key=user_key,
                )
                val_result_retry = validate_card_content(retry_content, raw_text)
                if val_result_retry.is_valid:
                    card_content = retry_content
                    val_result = val_result_retry
                else:
                    val_result = val_result_retry

            card.what_happened = card_content.what_happened
            card.why_it_matters = card_content.why_it_matters
            card.how_it_affects_you = card_content.how_it_affects_you
            card.action_type = card_content.what_to_do_next.action_type
            card.action_guidance = card_content.what_to_do_next.guidance
            card.model_name = settings.GEMINI_MODEL
            card.prompt_version = PROMPT_VERSION
            card.validation_status = val_result.status
            card.validation_notes = val_result.notes
            card.status = "published" if val_result.is_valid else "draft"
            db.commit()

            if val_result.is_valid:
                summary["synthesized"] += 1
            else:
                summary["flagged"] += 1

        except GeminiQuotaExceededError as qe:
            db.rollback()
            logger.warning(
                "Gemini quota or rate limit exceeded during backfill: %s. Halting backfill gracefully.",
                qe,
            )
            break
        except Exception as e:
            db.rollback()
            logger.error("Error backfilling card %s: %s", card.id, e)
            summary["errors"] += 1

    return summary


def ingest_single_feed(
    db: Session,
    tag_name: str,
    feed_url: str,
    stats: IngestionStats,
    limit: int = 15,
    max_gemini_calls: int | None = None,
    user_key: str | None = None,
) -> None:
    """Ingest a single feed source with isolated error handling."""
    source = get_or_create_source(db, feed_url, tag_name)
    now = datetime.now(UTC)
    source.last_fetched_at = now

    try:
        parsed_feed = feedparser.parse(feed_url)
        entries = getattr(parsed_feed, "entries", [])
        if not entries and getattr(parsed_feed, "bozo", 0):
            raise ValueError(
                f"Feed error: {getattr(parsed_feed, 'bozo_exception', 'Empty or unparseable feed content')}"
            )

        from app.feed_service import parse_feed_entry

        for entry in entries[:limit]:
            raw_data = parse_feed_entry(entry, tag_name, feed_url)
            process_raw_item_entry(
                db,
                source,
                raw_data,
                tag_name,
                stats,
                max_gemini_calls=max_gemini_calls,
                user_key=user_key,
            )

        source.last_success_at = datetime.now(UTC)
        source.last_error = None
        source.consecutive_failures = 0
        db.commit()
        stats.sources_fetched += 1
    except Exception as e:
        db.rollback()
        source.last_error = str(e)
        source.consecutive_failures += 1
        try:
            db.commit()
        except Exception:
            db.rollback()
        stats.errors += 1
        logger.error(f"Per-source isolation caught error on '{tag_name}' ({feed_url}): {e}")


def run_ingestion_pipeline(
    db: Session,
    user_interests: str = "",
    limit_per_source: int = 15,
    max_gemini_calls: int | None = None,
    user_key: str | None = None,
) -> IngestionStats:
    """Run full ingestion pipeline over configured feed sources within the per-run Gemini budget."""
    from app.feed_service import DEFAULT_FEED_SOURCES, resolve_feed_for_topic

    stats = IngestionStats()
    effective_budget = (
        settings.INGEST_MAX_GEMINI_CALLS_PER_RUN
        if max_gemini_calls is None
        else max_gemini_calls
    )

    feed_sources_to_use: List[Tuple[str, str]] = []
    topics = [t.strip() for t in user_interests.split(",") if t.strip()]

    if topics:
        seen = set()
        for t in topics:
            tag_name, url = resolve_feed_for_topic(t)
            if url not in seen:
                seen.add(url)
                feed_sources_to_use.append((tag_name, url))

    # If no interest topics provided or fewer than 2, combine with default sources
    if len(feed_sources_to_use) < 3:
        seen = {url for _, url in feed_sources_to_use}
        for name, url in DEFAULT_FEED_SOURCES.items():
            if url not in seen:
                seen.add(url)
                feed_sources_to_use.append((name, url))

    logger.info(
        "Starting ingestion pipeline across %d sources (max_gemini_calls=%d)...",
        len(feed_sources_to_use),
        effective_budget,
    )

    for tag_name, feed_url in feed_sources_to_use:
        ingest_single_feed(
            db,
            tag_name,
            feed_url,
            stats,
            limit=limit_per_source,
            max_gemini_calls=effective_budget,
            user_key=user_key,
        )

    # Process any deferred or unbridged raw_items from database fetchers
    process_unprocessed_raw_items(db, stats=stats, max_gemini_calls=effective_budget)

    logger.info(
        "Ingestion pipeline finished: sources_fetched=%d, raw_items_new=%d, raw_items_duplicate=%d, raw_items_deferred=%d, events_created=%d, cards_created=%d, gemini_calls_used=%d, errors=%d",
        stats.sources_fetched,
        stats.raw_items_new,
        stats.raw_items_duplicate,
        stats.raw_items_deferred,
        stats.events_created,
        stats.cards_created,
        stats.gemini_calls_used,
        stats.errors,
    )
    return stats


PROFESSION_SLUG_ALIASES: dict[str, str] = {
    "software-developer": "software-development",
    "software-engineer": "software-development",
    "developer": "software-development",
    "engineer": "software-development",
    "full-stack-developer": "software-development",
    "frontend-developer": "software-development",
    "backend-developer": "software-development",
    "accountant": "accounting",
    "finance": "accounting",
    "finance-accounting": "accounting",
    "financial-analyst": "accounting",
}


def resolve_existing_profession(db: Session, user_role: str) -> Profession | None:
    """Resolve a requested role string to an existing active Profession row.

    Never auto-creates Profession rows from request parameters.
    Matches by exact slug, exact case-insensitive name, or normalized slug alias.
    """
    clean_role = (user_role or "").strip()
    if not clean_role:
        return None

    role_lower = clean_role.lower()
    role_slug = re.sub(r"[^a-z0-9]+", "-", role_lower).strip("-")
    if not role_slug:
        return None

    alias_slug = PROFESSION_SLUG_ALIASES.get(role_slug)

    query = db.query(Profession).filter(Profession.is_active.is_(True))
    conditions = [(Profession.slug == role_slug), (func.lower(Profession.name) == role_lower)]
    if alias_slug:
        conditions.append(Profession.slug == alias_slug)

    from sqlalchemy import or_
    return query.filter(or_(*conditions)).first()


def get_or_create_card_variant(
    db: Session,
    card: Card,
    user_role: str,
    allow_generate: bool = True,
    user_key: str | None = None,
) -> Tuple[str, str, str]:
    """Retrieve or generate lazy cached CardVariant for an existing Profession.

    - Resolves `user_role` strictly against existing active `Profession` rows.
    - Never passes `custom_prompt` or arbitrary user free text into shared `CardVariant` rows;
      variants depend exclusively on the canonical `card` and the resolved `profession`.
    - When `allow_generate=False` (unauthenticated or anonymous guest callers), returns an
      already-cached shared variant if present, otherwise falls back to canonical card text
      with zero Gemini calls and zero DB writes.

    Returns:
        (how_it_affects_you, action_type, action_guidance)
    """
    profession = resolve_existing_profession(db, user_role)
    if not profession:
        return card.how_it_affects_you, card.action_type, card.action_guidance

    variant = (
        db.query(CardVariant)
        .filter(
            CardVariant.card_id == card.id,
            CardVariant.profession_id == profession.id,
        )
        .first()
    )

    if variant:
        return variant.how_it_affects_you, variant.action_type, variant.action_guidance

    if not allow_generate:
        return card.how_it_affects_you, card.action_type, card.action_guidance

    # First authenticated request for a known profession: generate shared variant from card + profession ONLY
    event_title = card.event.canonical_title if card.event else "Career Update"
    content = generate_action_card(
        article_title=event_title,
        source_url=card.source_url,
        raw_summary=card.why_it_matters,
        tech_tag="General",
        user_role=profession.name,
        custom_prompt="",
        user_key=user_key,
    )

    new_variant = CardVariant(
        card_id=card.id,
        profession_id=profession.id,
        topic_id=None,
        how_it_affects_you=content.how_it_affects_you,
        action_type=content.what_to_do_next.action_type,
        action_guidance=content.what_to_do_next.guidance,
        model_name="fallback-heuristic" if not ai_service.client else MODEL_NAME,
        prompt_version="1.0",
    )
    db.add(new_variant)
    try:
        db.commit()
        return new_variant.how_it_affects_you, new_variant.action_type, new_variant.action_guidance
    except IntegrityError:
        db.rollback()
        existing = db.query(CardVariant).filter(
            CardVariant.card_id == card.id,
            CardVariant.profession_id == profession.id,
        ).first()
        if existing:
            return existing.how_it_affects_you, existing.action_type, existing.action_guidance
        return (
            content.how_it_affects_you,
            content.what_to_do_next.action_type,
            content.what_to_do_next.guidance,
        )
