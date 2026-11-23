"""Relevance ranking and daily briefing builder for Becon (Task F4).

Implements:
1. Editorial relevance scoring per (user, card/event):
   - Topic match: primary tag (+40 pts) > secondary (+20 pts)
   - Followed version match boost (+15 pts)
   - Profession match via source_professions (+25 pts)
   - Severity scoring (+0.35 * severity_score, up to 35 pts)
   - Recency decay (0 to -35 pts)
   - High impact bonus (+10 pts for breaking, EOL, security)
   - Concise editorial match reason (e.g. "Matches: Kubernetes, high severity")
2. Diversity rule: max 2 cards per source in one briefing (relaxed if needed to ensure min cards).
3. Lead Story designation: highest score gets is_lead=True and priority="lead".
4. Briefing card limits: BRIEFING_MAX_CARDS (10), target minimum BRIEFING_MIN_CARDS (5).
5. Reading time estimation: word count / 150 wpm per card and summed for daily briefing.
6. Cold start fallback: profession default -> top severity + recency. Never returns empty if cards exist.
7. DB Caching per user per UTC day in `daily_briefings` (invalidated on profile change).
8. Guest and unauthenticated callers stay DB-only with zero Gemini calls.
9. Production filter: only validated, non-fallback, published cards in production.
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Card,
    DailyBriefing,
    Event,
    FocusTopic,
    Profession,
    RawItem,
    Source,
    SourceProfession,
    UserFocusTopic,
    UserProfile,
)
from app.schemas import ActionGuidance, BriefingCard, BriefingCardContent

logger = logging.getLogger(__name__)

BRIEFING_MIN_CARDS: int = 5
BRIEFING_MAX_CARDS: int = 10
WORDS_PER_MINUTE: int = 150


def estimate_card_reading_time(
    what_happened: list[str] | str,
    why_it_matters: str,
    how_it_affects_you: str,
    guidance: str,
) -> int:
    """Estimate reading time in minutes for an individual action card."""
    wh_text = " ".join(what_happened) if isinstance(what_happened, list) else str(what_happened)
    full_text = f"{wh_text} {why_it_matters} {how_it_affects_you} {guidance}"
    words = len(re.findall(r"\w+", full_text))
    return max(1, round(words / WORDS_PER_MINUTE))


def calculate_card_relevance(
    user: UserProfile | None,
    card: Card,
    event: Event,
    source: Source | None,
    user_topic_ids: Set[uuid.UUID],
    user_topic_versions: Dict[uuid.UUID, str],
    user_topic_names_lower: Set[str],
    user_profession_id: uuid.UUID | None,
    user_profession_name: str | None = None,
) -> Tuple[float, str]:
    """Calculate personalized relevance score and match reason for (user, card).

    Returns:
        (score, match_reason)
    """
    score: float = 0.0
    matched_topic_name: str | None = None
    has_primary_match: bool = False
    has_secondary_match: bool = False
    version_matched: str | None = None

    # 1. Topic Match
    if event and event.event_topics:
        for et in event.event_topics:
            t_obj = et.topic
            if not t_obj:
                continue

            t_id = t_obj.id
            t_name_lower = (t_obj.name or "").lower()
            t_slug_lower = (t_obj.slug or "").lower()

            is_match = (
                t_id in user_topic_ids
                or t_name_lower in user_topic_names_lower
                or t_slug_lower in user_topic_names_lower
            )

            if is_match:
                if et.is_primary and not has_primary_match:
                    score += 40.0
                    has_primary_match = True
                    matched_topic_name = t_obj.name
                elif not has_primary_match and not has_secondary_match:
                    score += 20.0
                    has_secondary_match = True
                    matched_topic_name = t_obj.name

                # Check version-specific follow boost
                followed_version = user_topic_versions.get(t_id)
                if (
                    followed_version
                    and et.version
                    and followed_version.strip().lstrip("vV") == et.version.strip().lstrip("vV")
                ):
                    score += 15.0
                    version_matched = et.version

    # Direct match against event title or card why_it_matters for user interests/keywords
    if not (has_primary_match or has_secondary_match) and user_topic_names_lower and event:
        title_lower = (event.canonical_title or "").lower()
        wim_lower = (card.why_it_matters or "").lower()
        for interest in user_topic_names_lower:
            if interest and (interest in title_lower or interest in wim_lower):
                score += 40.0
                matched_topic_name = interest.title()
                has_primary_match = True
                break

    # 2. Profession Match via source_professions
    profession_matched = False
    if source and user_profession_id and getattr(source, "source_professions", None):
        for sp in source.source_professions:
            if sp.profession_id == user_profession_id:
                score += 25.0
                profession_matched = True
                break

    # 3. Severity Scoring (D7): 0.35 * severity_score (up to 35 pts)
    sev = event.severity_score if event else 0
    sev_pts = round(0.35 * sev, 1)
    score += sev_pts

    # 4. Recency Decay
    now = datetime.now(UTC)
    pub_at = (event.published_at or card.published_at or event.first_seen_at) if event else None
    if pub_at:
        pub_utc = pub_at.replace(tzinfo=UTC) if pub_at.tzinfo is None else pub_at
        age_days = (now - pub_utc).total_seconds() / 86400.0
    else:
        age_days = 30.0

    if age_days <= 2.0:
        decay = 0.0
    elif age_days <= 7.0:
        decay = -5.0
    elif age_days <= 14.0:
        decay = -12.0
    elif age_days <= 30.0:
        decay = -20.0
    else:
        decay = -35.0
    score += decay

    # 5. High Impact / Category Bonus (+10 pts)
    is_breaking = getattr(event, "is_breaking", False)
    category = getattr(event, "category", "")
    if is_breaking or category in ("eol", "security"):
        score += 10.0

    # 6. Formulate human-readable match reason
    match_reason = ""
    if matched_topic_name:
        parts = [matched_topic_name]
        if version_matched:
            parts[0] = f"{matched_topic_name} (v{version_matched})"
        if is_breaking:
            parts.append("breaking change")
        elif sev >= 70:
            parts.append("high severity")
        elif category == "security":
            parts.append("security advisory")
        elif category == "eol":
            parts.append("end of life")
        elif category == "release":
            parts.append("release")
        match_reason = f"Matches: {', '.join(parts)}"
    elif profession_matched and user_profession_name:
        parts = [f"Relevant for {user_profession_name}"]
        if is_breaking:
            parts.append("breaking change")
        elif sev >= 70:
            parts.append("high severity")
        match_reason = ", ".join(parts)
    else:
        # Cold start reason
        if is_breaking:
            match_reason = "High impact: breaking change"
        elif sev >= 70:
            match_reason = "High severity security update"
        elif category == "release":
            match_reason = "Official release"
        elif category == "security":
            match_reason = "Security advisory"
        else:
            match_reason = "Industry intelligence"

    return round(score, 1), match_reason


def invalidate_daily_briefing_cache(db: Session, user_id: int) -> int:
    """Invalidate all cached daily briefings for a user (called on profile updates)."""
    deleted = db.query(DailyBriefing).filter(DailyBriefing.user_id == user_id).delete()
    db.commit()
    logger.info("Invalidated %d daily briefing cache entries for user_id=%d", deleted, user_id)
    return deleted


def build_daily_briefing(
    db: Session,
    user: UserProfile | None = None,
    user_interests: str = "",
    user_role: str = "Professional",
    force_refresh: bool = False,
    max_cards: int = BRIEFING_MAX_CARDS,
    min_cards: int = BRIEFING_MIN_CARDS,
    allow_variant_generation: bool = False,
    user_key: str | None = None,
) -> List[BriefingCard]:
    """Build a personalized, relevance-ranked daily briefing with DB caching.

    Enforces:
    - DB cache hit per user per UTC day (if authenticated non-guest)
    - Production filter (only validated, non-fallback, published cards in prod)
    - Source diversity cap (max 2 cards per source)
    - Lead Story designation (rank 1, is_lead=True)
    - Reading-time calculation
    - Cold-start fallback (never returns empty if cards exist)
    """
    today_utc_str = datetime.now(UTC).strftime("%Y-%m-%d")

    # 1. Check DB Cache for authenticated non-guest users
    is_authenticated_non_guest = bool(user and not user.is_anonymous)
    if is_authenticated_non_guest and not force_refresh:
        cached = (
            db.query(DailyBriefing)
            .filter(
                DailyBriefing.user_id == user.id,
                DailyBriefing.briefing_date == today_utc_str,
            )
            .first()
        )
        if cached and cached.cards_payload:
            try:
                cards_data = cached.cards_payload
                if isinstance(cards_data, list):
                    return [BriefingCard(**item) for item in cards_data]
            except Exception as e:
                logger.warning("Failed to deserialize cached daily briefing for user %s: %e", user.id, e)

    # 2. Resolve User Preferences
    user_topic_ids: Set[uuid.UUID] = set()
    user_topic_versions: Dict[uuid.UUID, str] = {}
    user_topic_names_lower: Set[str] = set()
    user_profession_id: uuid.UUID | None = None
    user_profession_name: str | None = None

    if user:
        user_profession_id = user.profession_id
        if user.profession:
            user_profession_name = user.profession.name

        # Followed topics from user_focus_topics
        if getattr(user, "focus_topics", None):
            for uft in user.focus_topics:
                user_topic_ids.add(uft.topic_id)
                if uft.version:
                    user_topic_versions[uft.topic_id] = uft.version
                if uft.topic and uft.topic.name:
                    user_topic_names_lower.add(uft.topic.name.lower())
                if uft.topic and uft.topic.slug:
                    user_topic_names_lower.add(uft.topic.slug.lower())

        # Interests from profile string
        if user.interests:
            for item in user.interests.split(","):
                cleaned = item.strip().lower()
                if cleaned:
                    user_topic_names_lower.add(cleaned)

    # Add interest topics from query param
    if user_interests:
        for item in user_interests.split(","):
            cleaned = item.strip().lower()
            if cleaned:
                user_topic_names_lower.add(cleaned)

    # 3. Query Candidate Published Cards
    query = (
        db.query(Card)
        .join(Event, Card.event_id == Event.id)
        .filter(Card.status == "published")
    )

    if settings.ENVIRONMENT == "production":
        query = query.filter(
            Card.model_name != "fallback-heuristic",
            Card.validation_status == "passed",
        )

    candidate_cards: List[Card] = query.all()
    if not candidate_cards:
        return []

    # 4. Score Candidate Cards
    scored_candidates: List[Dict[str, Any]] = []
    for card in candidate_cards:
        event = card.event
        raw = event.raw_items[0] if event and event.raw_items else None
        source = raw.source if raw else None

        score, match_reason = calculate_card_relevance(
            user=user,
            card=card,
            event=event,
            source=source,
            user_topic_ids=user_topic_ids,
            user_topic_versions=user_topic_versions,
            user_topic_names_lower=user_topic_names_lower,
            user_profession_id=user_profession_id,
            user_profession_name=user_profession_name,
        )

        pub_time = (
            (event.published_at or card.published_at or event.first_seen_at)
            if event
            else datetime.now(UTC)
        )
        scored_candidates.append({
            "card": card,
            "event": event,
            "source": source,
            "score": score,
            "match_reason": match_reason,
            "pub_time": pub_time or datetime.min.replace(tzinfo=UTC),
        })

    # Sort primarily by relevance score descending, then by publication recency
    scored_candidates.sort(key=lambda x: (x["score"], x["pub_time"]), reverse=True)

    # 5. Apply Source Diversity Rule (max 2 cards per source)
    selected_items: List[Dict[str, Any]] = []
    source_counts: Counter[uuid.UUID | str] = Counter()
    effective_min = min(min_cards, max_cards)

    for item in scored_candidates:
        src_id = item["source"].id if item["source"] else "unknown"
        if source_counts[src_id] < 2:
            selected_items.append(item)
            source_counts[src_id] += 1
            if len(selected_items) >= max_cards:
                break

    # If diversity cap left fewer than effective_min, relax cap to reach effective_min
    if len(selected_items) < effective_min and len(selected_items) < len(scored_candidates):
        selected_ids = {it["card"].id for it in selected_items}
        for item in scored_candidates:
            if item["card"].id not in selected_ids:
                selected_items.append(item)
                selected_ids.add(item["card"].id)
                if len(selected_items) >= effective_min or len(selected_items) >= max_cards:
                    break

    # 6. Build BriefingCard DTOs with Lead Story and Reading Time
    from app.feed_service import _db_card_to_briefing_card

    briefing_cards: List[BriefingCard] = []
    total_reading_minutes = 0

    for rank_idx, item in enumerate(selected_items, 1):
        card = item["card"]
        event = item["event"]
        is_lead = (rank_idx == 1)

        dto = _db_card_to_briefing_card(
            db=db,
            card=card,
            rank=rank_idx,
            user_role=user_role,
            allow_variant_generation=allow_variant_generation,
            user_key=user_key,
        )

        # Set Lead Story and Priority
        dto.is_lead = is_lead
        if is_lead:
            dto.priority = "lead"
        elif rank_idx in (2, 3, 4):
            dto.priority = "major"
        else:
            dto.priority = "brief"

        # Calculate Reading Time
        reading_time = estimate_card_reading_time(
            what_happened=dto.card_content.what_happened,
            why_it_matters=dto.card_content.why_it_matters,
            how_it_affects_you=dto.card_content.how_it_affects_you,
            guidance=dto.card_content.what_to_do_next.guidance,
        )
        dto.reading_time_minutes = reading_time
        total_reading_minutes += reading_time

        # Match reason
        dto.match_reason = item["match_reason"]
        briefing_cards.append(dto)

    # 7. Persist to DB Cache for authenticated non-guest users
    if is_authenticated_non_guest and briefing_cards:
        try:
            payload = [c.model_dump() for c in briefing_cards]
            existing = (
                db.query(DailyBriefing)
                .filter(
                    DailyBriefing.user_id == user.id,
                    DailyBriefing.briefing_date == today_utc_str,
                )
                .first()
            )
            if existing:
                existing.cards_payload = payload
                existing.reading_time_minutes = total_reading_minutes
                existing.updated_at = datetime.now(UTC)
            else:
                new_briefing = DailyBriefing(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    briefing_date=today_utc_str,
                    cards_payload=payload,
                    reading_time_minutes=total_reading_minutes,
                )
                db.add(new_briefing)
            db.commit()
            logger.info(
                "Persisted daily briefing cache for user %s on %s (%d cards, %d mins)",
                user.id,
                today_utc_str,
                len(briefing_cards),
                total_reading_minutes,
            )
        except Exception as e:
            db.rollback()
            logger.warning("Could not persist daily briefing cache for user %s: %s", user.id, e)

    return briefing_cards