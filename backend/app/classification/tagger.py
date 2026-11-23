"""Topic tagging for Becon events.

Matches event title + source text against focus topics and their aliases using
case-insensitive word-boundary matching.

Precision rules (F2.1):
1. Exact alias tokens with word boundaries only; ignores bare common words (e.g. 'next', 'go', 'node', 'py', 'js', 'ts').
2. Version extraction is strictly coupled to the specific topic term; never matches a topic from version alone.
3. Title matches are weighted heavily above body matches. Body-only matches require >= 2 distinct hits.
4. Source's own associated topics act as a strong prior (e.g. TypeScript blog item prioritizes TypeScript).
5. Caps tags per event to at most 4, ordered by confidence.
6. The highest-confidence tag is marked as primary (is_primary=True).
7. Untagged events are allowed and expected.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models import Event, EventTopic, FocusTopic, RawItem, Source

logger = logging.getLogger(__name__)

# Common English words, single letters, or noisy acronyms that match ubiquitously
# if matched case-insensitively without surrounding context.
SKIP_BARE_TERMS: set[str] = {
    "next",  # "what's next", "next release", "next step", "next version"
    "go",  # Common English verb ("go to", "go back")
    "node",  # Cluster node, AST node, DOM node
    "py",  # Random letters / code snippets
    "js",  # File extensions (.js)
    "ts",  # Acronym / noisy
    "ng",  # Acronym
    "c",  # Single letter
    "r",  # Single letter
    "action",  # Generic English word
    "view",  # Generic English word
    "native",  # Generic English word
}

# English verbs or common nouns whose technical names must be case-sensitive in body text
# to avoid matching colloquial usage (e.g. "to react to changes" vs React framework).
CASE_SENSITIVE_BODY_TERMS: set[str] = {
    "React",
    "Go",
    "Rust",
    "Swift",
    "Dart",
}


def build_term_regex(term: str, case_sensitive: bool = False) -> re.Pattern:
    """Build word-boundary pattern for a term, supporting non-alphanumeric punctuation."""
    clean = term.strip()
    left_anchor = r"\b" if clean and clean[0].isalnum() else r"(?:^|[\s(\[<'\"])"
    right_anchor = r"\b" if clean and clean[-1].isalnum() else r"(?:$|[\s)\]>'\":,.;!?])"
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.compile(left_anchor + re.escape(clean) + right_anchor, flags)


def extract_topic_version(title: str, term: str) -> str | None:
    """Attempt to extract a version number specifically associated with this topic term in the title.

    Never extracts a version number in isolation or from unrelated parts of the title.
    """
    clean = term.strip()
    if not clean or len(clean) < 2:
        return None

    left_anchor = r"\b" if clean[0].isalnum() else r"(?:^|[\s(\[<'\"\-])"
    right_anchor = r"\b" if clean[-1].isalnum() else r"(?:$|[\s)\]>'\"\-:,.;!?])"

    # 1. Term followed directly by version: e.g. "TypeScript 6.0", "TypeScript v6.0", ".NET 11", "Rust 1.99.0"
    p1 = re.compile(
        left_anchor + re.escape(clean) + r"[\s:/\-–—]+v?(\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?)\b",
        re.IGNORECASE,
    )
    m1 = p1.search(title)
    if m1:
        return m1.group(1).lstrip("vV")

    # 2. Version followed by term: e.g. "v6.0 of TypeScript", "1.23 release of Go"
    p2 = re.compile(
        r"\bv?(\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?)\s+(?:of|for|in)\s+" + re.escape(clean) + right_anchor,
        re.IGNORECASE,
    )
    m2 = p2.search(title)
    if m2:
        return m2.group(1).lstrip("vV")

    return None


def match_event_topics(
    db: Session,
    title: str,
    text: str = "",
    source: Source | None = None,
) -> List[Tuple[uuid.UUID, str | None, float]]:
    """Match title and body text against all active focus topics and aliases.

    Returns:
        List of (topic_id, version, confidence) capped at 4 items, sorted by confidence descending.
        The first element is the designated primary tag.
    """
    topics = db.query(FocusTopic).filter(FocusTopic.is_active.is_(True)).all()
    if not topics:
        return []

    # Map source's own assigned topic IDs for boosting / prior
    source_topic_ids: set[uuid.UUID] = set()
    if source and getattr(source, "source_topics", None):
        for st in source.source_topics:
            if st.topic_id:
                source_topic_ids.add(st.topic_id)

    clean_title = title.strip()
    clean_text = text.strip() if text else ""

    candidates: list[dict] = []

    for topic in topics:
        # Collect candidate terms deduplicated case-insensitively
        # to avoid double-counting synonymous terms (e.g. name="Vite" vs slug="vite")
        term_map: dict[str, str] = {}
        for raw in [topic.name, topic.slug] + [(al.alias or "").strip() for al in (topic.aliases or [])]:
            clean = raw.strip() if raw else ""
            if not clean:
                continue
            lower_clean = clean.lower()
            if lower_clean in SKIP_BARE_TERMS:
                continue
            if len(clean) < 2 and lower_clean not in ("c#",):
                continue
            if lower_clean not in term_map:
                term_map[lower_clean] = clean
            elif clean in CASE_SENSITIVE_BODY_TERMS:
                term_map[lower_clean] = clean

        is_go_topic = topic.slug == "golang" or topic.name == "Go" or (topic.slug and "go" in topic.slug)
        is_source_topic = topic.id in source_topic_ids

        title_matched_terms: list[str] = []
        body_matched_terms: set[str] = set()
        body_hit_count = 0

        for lower_key, term in term_map.items():
            # Title matching is case-insensitive
            rgx_title = build_term_regex(term, case_sensitive=False)
            if rgx_title.search(clean_title):
                title_matched_terms.append(term)

            if clean_text:
                # Body matching requires case-sensitivity for colloquial English verbs
                is_case_sens = term in CASE_SENSITIVE_BODY_TERMS
                rgx_body = build_term_regex(term, case_sensitive=is_case_sens)
                matches = rgx_body.findall(clean_text)
                if matches:
                    body_hit_count += len(matches)
                    body_matched_terms.add(lower_key)

        # For Go, also check "golang" or capitalized "Go" followed by version or from Go source
        if is_go_topic:
            go_ver_rgx = re.compile(r"\bGo\s+v?(\d+\.\d+(?:\.\d+)?)\b", re.IGNORECASE)
            if go_ver_rgx.search(clean_title):
                title_matched_terms.append("Go")
            elif is_source_topic and re.search(r"\bGo\b", clean_title):
                title_matched_terms.append("Go")

        in_title = len(title_matched_terms) > 0
        # Stricter body threshold:
        # 1. If assigned source topic, >= 1 body hit qualifies.
        # 2. Otherwise (body-only non-source topic): requires at least 2 distinct alias hits OR >= 5 mentions in body.
        in_body = False
        if is_source_topic and body_hit_count >= 1:
            in_body = True
        elif not in_title:
            in_body = (len(body_matched_terms) >= 2) or (body_hit_count >= 5)
        else:
            in_body = body_hit_count >= 1

        if not in_title and not in_body:
            continue

        # Confidence calculation:
        # Weight title matches (0.85) above body matches (0.55).
        if in_title and in_body:
            conf = 0.90
        elif in_title:
            conf = 0.85
        else:
            conf = 0.55

        # Strong prior boost from source topic mapping (+0.20)
        if is_source_topic:
            conf += 0.20

        # Extract version strictly coupled to title match for this topic
        version = None
        if in_title:
            for term in title_matched_terms:
                ver = extract_topic_version(clean_title, term)
                if ver:
                    version = ver
                    break
            if not version and is_go_topic:
                m_gov = re.search(r"\bGo\s+v?(\d+\.\d+(?:\.\d+)?)\b", clean_title)
                if m_gov:
                    version = m_gov.group(1)

        conf = min(1.0, round(conf, 2))

        candidates.append({
            "topic_id": topic.id,
            "name": topic.name,
            "version": version,
            "confidence": conf,
            "in_title": in_title,
            "is_source_topic": is_source_topic,
            "body_hit_count": body_hit_count,
        })

    # If no title or body matches occurred at all, but the source is dedicated to a specific topic
    # (e.g. SQLite release feed where title is just "Version 3.54.1" or Angular release "22.2.7"):
    if not candidates and source and source_topic_ids:
        src_name_lower = (source.name or "").lower()
        src_slug_lower = (source.slug or "").lower()
        for st_id in source_topic_ids:
            st_obj = next((t for t in topics if t.id == st_id), None)
            if not st_obj:
                continue
            t_name_lower = (st_obj.name or "").lower()
            t_slug_lower = (st_obj.slug or "").lower()
            is_dedicated = (
                (t_name_lower in src_name_lower or t_slug_lower in src_slug_lower)
                or (len(source_topic_ids) == 1 and getattr(source, "type", "") in ("release", "changelog", "github_release"))
            )
            if is_dedicated:
                candidates.append({
                    "topic_id": st_obj.id,
                    "name": st_obj.name,
                    "version": None,
                    "confidence": 0.65,
                    "in_title": False,
                    "is_source_topic": True,
                    "body_hit_count": 0,
                })

    if not candidates:
        return []

    # Order candidates:
    # 1. Confidence descending
    # 2. Is source topic
    # 3. In title
    # 4. Body hit count
    candidates.sort(
        key=lambda c: (
            c["confidence"],
            1 if c["is_source_topic"] else 0,
            1 if c["in_title"] else 0,
            c["body_hit_count"],
        ),
        reverse=True,
    )

    # Cap tags per event (max 4)
    selected = candidates[:4]
    return [(c["topic_id"], c["version"], c["confidence"]) for c in selected]


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
    for idx, (topic_id, version, confidence) in enumerate(matches):
        et = EventTopic(
            event_id=event.id,
            topic_id=topic_id,
            version=version,
            confidence=confidence,
            is_primary=(idx == 0),
        )
        db.add(et)
        created.append(et)

    return created
