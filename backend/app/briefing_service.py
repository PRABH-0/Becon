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

import logging
import re
import uuid
from collections import Counter
from datetime import UTC, datetime
from typing import Any, Dict, List, Set, Tuple

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Card,
    DailyBriefing,
    Event,
    Profession,
    Source,
    UserProfile,
)
from app.schemas import BriefingCard

logger = logging.getLogger(__name__)

BRIEFING_MIN_CARDS: int = 5
BRIEFING_MAX_CARDS: int = 10
WORDS_PER_MINUTE: int = 150

PRERELEASE_RE = re.compile(
    r"(?i)(?:[-._](?:rc|beta|alpha|preview|nightly|pre|next|canary|dev|snapshot|insiders)[-._\d]*"
    r"|\b(?:rc\d*|beta\d*|alpha\d*|preview\d*|nightly|canary|snapshot|insiders|pre-?release|release\s+candidate)\b"
    r"|\bnext\b(?!\.js)"
    r"|\b(?:dev|pre)[-._\d]+)",
    re.IGNORECASE,
)


def is_prerelease(title: str, version: str | None = None) -> bool:
    """Detect whether a title or version indicates a prerelease."""
    if title and PRERELEASE_RE.search(title):
        return True
    if version and PRERELEASE_RE.search(version):
        return True
    return False


def extract_base_version(title: str, version: str | None = None) -> str | None:
    """Extract semantic base version (e.g. '29.10.0' from 'Docker v29.10.0-rc.2')."""
    target = version or title
    if not target:
        return None
    m = re.search(r"v?(\d+\.\d+(?:\.\d+)*)", target)
    return m.group(1) if m else None


def get_product_key(card: Card, event: Event | None, source: Source | None) -> str:
    """Get canonical product key for an event to group releases."""
    if event and event.event_topics:
        for et in event.event_topics:
            if et.is_primary and et.topic:
                return f"topic:{et.topic.slug or et.topic.name.lower()}"
    if source:
        return f"source:{source.id}"
    if event and event.canonical_title:
        first_word = event.canonical_title.strip().split()[0].lower()
        return f"title:{first_word}"
    return f"card:{card.id}"


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
) -> Tuple[float, str, bool, bool]:
    """Calculate personalized relevance score and match reason for (user, card).

    Returns:
        (score, match_reason, is_matched, card_is_prerelease)
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

    # 6. Prerelease Detection & Score Penalty (-15 pts)
    title_str = getattr(event, "canonical_title", "") or ""
    card_is_prerelease = is_prerelease(title_str, version_matched)
    if card_is_prerelease:
        score -= 15.0

    # 7. Relevance Floor: Matched Qualification
    is_critical_security = bool(
        event
        and (event.severity_score or 0) >= 90
        and getattr(event, "category", "") == "security"
    )
    is_matched = bool(
        has_primary_match
        or has_secondary_match
        or profession_matched
        or is_critical_security
    )

    # 8. Formulate human-readable match reason
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

    return round(score, 1), match_reason, is_matched, card_is_prerelease


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
    is_production: bool | None = None,
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

    has_user_preferences = bool(user_topic_ids or user_topic_names_lower or user_profession_id)
    if not has_user_preferences:
        # Cold start fallback: resolve DB-driven default profession if configured; otherwise fall back to severity + recency
        default_profession = (
            db.query(Profession).filter(Profession.is_default.is_(True), Profession.is_active.is_(True)).first()
        )
        if default_profession:
            user_profession_id = default_profession.id
            user_profession_name = default_profession.name

    # 3. Query Candidate Published Cards
    query = (
        db.query(Card)
        .join(Event, Card.event_id == Event.id)
        .filter(Card.status == "published")
    )

    prod_mode = (settings.ENVIRONMENT == "production") if is_production is None else is_production
    if prod_mode:
        query = query.filter(
            Card.model_name != "fallback-heuristic",
            Card.validation_status == "passed",
        )

    candidate_cards: List[Card] = query.all()
    if not candidate_cards:
        return []

    # 3b. Prerelease Handling: Exclude prereleases when a final release of the same product+version exists
    final_releases: Set[Tuple[str, str]] = set()
    for card in candidate_cards:
        ev = card.event
        raw = ev.raw_items[0] if ev and ev.raw_items else None
        src = raw.source if raw else None
        t_title = (ev.canonical_title if ev else "") or ""
        if not is_prerelease(t_title):
            b_ver = extract_base_version(t_title)
            if b_ver:
                pkey = get_product_key(card, ev, src)
                final_releases.add((pkey, b_ver))

    filtered_candidate_cards: List[Card] = []
    for card in candidate_cards:
        ev = card.event
        raw = ev.raw_items[0] if ev and ev.raw_items else None
        src = raw.source if raw else None
        t_title = (ev.canonical_title if ev else "") or ""
        if is_prerelease(t_title):
            b_ver = extract_base_version(t_title)
            if b_ver:
                pkey = get_product_key(card, ev, src)
                if (pkey, b_ver) in final_releases:
                    # Suppress prerelease because final release exists
                    continue
        filtered_candidate_cards.append(card)

    # 4. Score Candidate Cards
    scored_candidates: List[Dict[str, Any]] = []
    for card in filtered_candidate_cards:
        event = card.event
        raw = event.raw_items[0] if event and event.raw_items else None
        source = raw.source if raw else None

        score, match_reason, is_matched, card_is_pre = calculate_card_relevance(
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
            "is_matched": is_matched,
            "is_prerelease": card_is_pre,
            "pub_time": pub_time or datetime.min.replace(tzinfo=UTC),
        })

    # Sort primarily by relevance score descending, then by publication recency
    scored_candidates.sort(key=lambda x: (x["score"], x["pub_time"]), reverse=True)

    # 5. Apply Relevance Floor & Source Diversity Rule
    # - A card needs user topic match, profession match, or (severity >= 90 & security) to qualify as matched
    # - Cap generic/no-match cards at 2 per briefing (for users with preferences)
    # - Max 2 cards per source
    # - Return fewer than 5 cards rather than pad with noise
    selected_items: List[Dict[str, Any]] = []
    source_counts: Counter[uuid.UUID | str] = Counter()
    generic_count = 0

    for item in scored_candidates:
        src_id = item["source"].id if item["source"] else "unknown"
        card_matched = item["is_matched"]

        # Relevance floor: cap generic/no-match cards at 2
        if not card_matched and has_user_preferences:
            if generic_count >= 2:
                continue

        # Diversity rule: max 2 cards per source
        if source_counts[src_id] >= 2:
            continue

        selected_items.append(item)
        source_counts[src_id] += 1
        if not card_matched:
            generic_count += 1

        if len(selected_items) >= max_cards:
            break

    # Cold start fallback: never return an empty briefing if events exist
    if not selected_items and scored_candidates:
        for item in scored_candidates[:min(min_cards, max_cards)]:
            selected_items.append(item)

    # 5b. Lead Story Selection:
    # - Demote prereleases and never allow one as Lead
    # - No generic card as Lead when a matched card exists in selected_items
    lead_idx: int | None = None
    has_matched = any(it["is_matched"] for it in selected_items)

    if has_matched:
        for idx, it in enumerate(selected_items):
            if it["is_matched"] and not it["is_prerelease"]:
                lead_idx = idx
                break

    if lead_idx is None:
        for idx, it in enumerate(selected_items):
            if not it["is_prerelease"]:
                lead_idx = idx
                break

    if lead_idx is not None and lead_idx > 0:
        chosen_lead = selected_items.pop(lead_idx)
        selected_items.insert(0, chosen_lead)

    allow_lead_at_top = bool(selected_items and not selected_items[0]["is_prerelease"])

    # 6. Build BriefingCard DTOs with Lead Story and Reading Time
    from app.feed_service import _db_card_to_briefing_card

    briefing_cards: List[BriefingCard] = []
    total_reading_minutes = 0

    for rank_idx, item in enumerate(selected_items, 1):
        card = item["card"]
        event = item["event"]
        is_lead = (rank_idx == 1 and allow_lead_at_top)

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

    # Production briefing fallback: if fewer than 3 validated cards exist, flag status_note
    if prod_mode and len(briefing_cards) < 3:
        for dto in briefing_cards:
            dto.status_note = "limited_today"

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