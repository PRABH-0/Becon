"""Topic tagging for Becon events.

Matches event title + source text against focus topics and their aliases using
case-insensitive word-boundary matching. Boosts confidence if the source's own
topic/profession mapping includes the topic.
"""

from __future__ import annotations

import logging
import re
from typing import List, Tuple
import uuid

from sqlalchemy.orm import Session

from app.models import Event, EventTopic, FocusTopic, RawItem, Source, SourceTopic, TopicAlias
from app.validation import VERSION_RE

logger = logging.getLogger(__name__)


def build_term_regex(term: str) -> re.Pattern:
    """Build word-boundary pattern for a term, supporting non-alphanumeric punctuation."""
    clean = term.strip()
    left_anchor = r"\b" if clean and clean[0].isalnum() else r"(?:^|[\s(\[<'\"])"
    right_anchor = r"\b" if clean and clean[-1].isalnum() else r"(?:$|[\s)\]>'\":,.;!?])"
    return re.compile(left_anchor + re.escape(clean) + right_anchor, re.IGNORECASE)


def extract_topic_version(text: str, term: str) -> str | None:
    """Attempt to extract a version number immediately following or associated with a topic term."""
    # Pattern: term followed by v1.2.3 or 1.2.3
    pattern = re.compile(
        re.escape(term) + r"[\s:/\-–—]*v?(\d+\.\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?)\b",
        re.IGNORECASE,
    )
    m = pattern.search(text)
    if m:
        return m.group(1)

    # General version in title fallback
    vm = VERSION_RE.search(text)
    if vm:
        return vm.group(1).lstrip("vV")
    return None


def match_event_topics(
    db: Session,
    title: str,
    text: str = "",
    source: Source | None = None,
) -> List[Tuple[uuid.UUID, str | None, float]]:
    """Match text against all active focus topics and aliases.

    Returns:
        List of (topic_id, version, confidence)
    """
    topics = db.query(FocusTopic).filter(FocusTopic.is_active.is_(True)).all()
    if not topics:
        return []

    # Map source's own assigned topic IDs for boosting
    source_topic_ids: set[uuid.UUID] = set()
    if source and getattr(source, "source_topics", None):
        for st in source.source_topics:
            if st.topic_id:
                source_topic_ids.add(st.topic_id)

    matched: List[Tuple[uuid.UUID, str | None, float]] = []

    combined_text = f"{title} {text}"

    for topic in topics:
        # Collect terms: name, slug, aliases
        terms: set[str] = {topic.name, topic.slug}
        if topic.aliases:
            for al in topic.aliases:
                if al.alias:
                    terms.add(al.alias)

        in_title = False
        in_text = False
        matched_term = None

        for term in terms:
            # Skip single-character terms (like 'c' without #) unless exact language
            if len(term) < 2 and term.lower() not in ("c", "r"):
                continue

            rgx = build_term_regex(term)
            if rgx.search(title):
                in_title = True
                matched_term = term
                break
            elif not in_text and text and rgx.search(text):
                in_text = True
                matched_term = term

        if not in_title and not in_text:
            continue

        # Confidence calculation
        if in_title and in_text:
            conf = 0.90
        elif in_title:
            conf = 0.80
        else:
            conf = 0.50

        # Boost from source mapping
        if topic.id in source_topic_ids:
            conf += 0.20

        conf = min(1.0, round(conf, 2))

        # Extract optional version
        version = extract_topic_version(title, matched_term or topic.name)

        matched.append((topic.id, version, conf))

    # If no text matches occurred, fall back to source's direct topics
    if not matched and source_topic_ids:
        for tid in source_topic_ids:
            matched.append((tid, None, 0.50))

    return matched


def populate_event_topics(
    db: Session,
    event: Event,
    raw_item: RawItem | None = None,
    source: Source | None = None,
) -> List[EventTopic]:
    """Tag an Event with matching FocusTopics and persist EventTopic rows."""
    title = event.canonical_title or ""
    text = ""
    if raw_item:
        text = raw_item.content_text or raw_item.summary or ""

    src = source
    if not src and raw_item and raw_item.source:
        src = raw_item.source

    matches = match_event_topics(db, title=title, text=text, source=src)

    # Clear existing event topics to ensure idempotency
    db.query(EventTopic).filter(EventTopic.event_id == event.id).delete()

    created: List[EventTopic] = []
    for topic_id, version, confidence in matches:
        et = EventTopic(
            event_id=event.id,
            topic_id=topic_id,
            version=version,
            confidence=confidence,
        )
        db.add(et)
        created.append(et)

    return created
