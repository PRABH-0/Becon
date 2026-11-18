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
from datetime import UTC, datetime
from typing import List, Tuple

import feedparser
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import app.ai_service as ai_service
from app.ai_service import MODEL_NAME, generate_action_card
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

logger = logging.getLogger("becon.ingestion")


@dataclass
class IngestionStats:
    sources_fetched: int = 0
    raw_items_new: int = 0
    raw_items_duplicate: int = 0
    events_created: int = 0
    cards_created: int = 0
    errors: int = 0


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


def classify_event_category(title: str, summary: str) -> str:
    """Classify event into category: release, deprecation, security, eol, industry, content."""
    combined = (title + " " + summary).lower()
    if any(k in combined for k in ["cve-", "vulnerability", "security", "patch", "exploit", "advisory", "zero-day"]):
        return "security"
    if any(k in combined for k in ["deprecated", "deprecation"]):
        return "deprecation"
    if any(k in combined for k in ["end of life", "eol", "sunset", "retire"]):
        return "eol"
    if any(k in combined for k in ["release", "v1.", "v2.", "v3.", "v4.", "v5.", "version", "launch", "announced"]):
        return "release"
    if any(k in combined for k in ["market", "acquisition", "funding", "ipo", "layoff", "tax", "gst", "regulation"]):
        return "industry"
    return "content"


def evaluate_severity_score(category: str, title: str, summary: str) -> int:
    """Calculate severity score 0-100 based on event category and impact markers."""
    combined = (title + " " + summary).lower()
    score = 45
    if category == "security":
        score = 85
        if any(k in combined for k in ["critical", "rce", "zero-day", "high severity"]):
            score = 98
    elif category in ("deprecation", "eol"):
        score = 75
    elif category == "release":
        score = 60
        if any(k in combined for k in ["breaking", "major release", "incompatible"]):
            score = 80
    elif category == "industry":
        score = 50

    return min(100, max(0, score))


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
) -> Card | None:
    """Process a single parsed feed entry through RawItem, Event dedup, and Card creation."""
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
        stats.raw_items_duplicate += 1
        return None

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
        status="processed",
    )
    db.add(raw_item)
    db.flush()
    stats.raw_items_new += 1

    # 2. Exact Deduplication into Events
    # Check 1: exact normalized URL across all sources
    event = db.query(Event).filter(Event.canonical_url == norm_url).first()

    # Check 2: exact normalized title across all sources
    if not event:
        title_lower = raw_title.lower()
        event = db.query(Event).filter(func.lower(Event.canonical_title) == title_lower).first()

    if event:
        # Deduplicated into existing event
        raw_item.event_id = event.id
        db.flush()
    else:
        cat = classify_event_category(raw_title, raw_summary)
        sev = evaluate_severity_score(cat, raw_title, raw_summary)
        is_breaking = any(
            w in (raw_title + " " + raw_summary).lower()
            for w in ["breaking change", "incompatible", "deprecated"]
        )

        event = Event(
            canonical_title=raw_title,
            canonical_url=norm_url,
            category=cat,
            severity_score=sev,
            is_breaking=is_breaking,
            first_seen_at=datetime.now(UTC),
            published_at=pub_dt,
            status="published",
        )
        db.add(event)
        db.flush()
        raw_item.event_id = event.id
        db.flush()
        stats.events_created += 1

        # Link FocusTopic to EventTopic
        if tag_name:
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
                db.add(EventTopic(event_id=event.id, topic_id=topic.id, confidence=1.0))
                db.flush()

    # 3. Create Shared Canonical Card (1 per event)
    card = db.query(Card).filter(Card.event_id == event.id).first()
    if not card:
        card_content = generate_action_card(
            article_title=event.canonical_title,
            source_url=event.canonical_url,
            raw_summary=raw_summary,
            tech_tag=tag_name,
        )

        card = Card(
            event_id=event.id,
            what_happened=card_content.what_happened,
            why_it_matters=card_content.why_it_matters,
            how_it_affects_you=card_content.how_it_affects_you,
            action_type=card_content.what_to_do_next.action_type,
            action_guidance=card_content.what_to_do_next.guidance,
            source_url=event.canonical_url,
            source_text_hash=content_hash,
            model_name="fallback-heuristic" if not ai_service.client else MODEL_NAME,
            prompt_version="1.0",
            validation_status="passed",
            published_at=event.published_at or datetime.now(UTC),
            status="published",
        )
        db.add(card)
        db.flush()
        stats.cards_created += 1

    return card


def ingest_single_feed(
    db: Session,
    tag_name: str,
    feed_url: str,
    stats: IngestionStats,
    limit: int = 15,
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
            process_raw_item_entry(db, source, raw_data, tag_name, stats)

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
) -> IngestionStats:
    """Run full ingestion pipeline over configured feed sources."""
    from app.feed_service import DEFAULT_FEED_SOURCES, resolve_feed_for_topic

    stats = IngestionStats()

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

    logger.info(f"Starting ingestion pipeline across {len(feed_sources_to_use)} sources...")

    for tag_name, feed_url in feed_sources_to_use:
        ingest_single_feed(db, tag_name, feed_url, stats, limit=limit_per_source)

    logger.info(
        "Ingestion pipeline finished: sources_fetched=%d, raw_items_new=%d, raw_items_duplicate=%d, events_created=%d, cards_created=%d, errors=%d",
        stats.sources_fetched,
        stats.raw_items_new,
        stats.raw_items_duplicate,
        stats.events_created,
        stats.cards_created,
        stats.errors,
    )
    return stats


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

    return (
        db.query(Profession)
        .filter(
            Profession.is_active.is_(True),
            (Profession.slug == role_slug) | (func.lower(Profession.name) == role_lower),
        )
        .first()
    )


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
