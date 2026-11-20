"""F2 Backfill script: title normalization, category classification, tagging, severity scoring, and fallback card status."""

import sys
from pathlib import Path
from collections import Counter

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import SessionLocal
from app.models import Event, Card, EventTopic, RawItem, Source, FocusTopic
from app.classification import (
    normalize_event_title,
    classify_event_category,
    calculate_severity_score,
    populate_event_topics,
)


def run_backfill():
    db = SessionLocal()
    try:
        # 1. Update fallback cards to "unvalidated"
        fallback_cards = db.query(Card).filter(Card.model_name == "fallback-heuristic").all()
        updated_cards_count = 0
        for card in fallback_cards:
            if card.validation_status != "unvalidated":
                card.validation_status = "unvalidated"
                notes = card.validation_notes or {}
                if isinstance(notes, dict):
                    notes["reason"] = "fallback_unvalidated"
                card.validation_notes = notes
                updated_cards_count += 1
        db.commit()
        print(f"Updated {updated_cards_count} fallback cards to validation_status='unvalidated' (total fallback cards: {len(fallback_cards)})")

        # 2. Process all events
        events = db.query(Event).all()
        print(f"Processing {len(events)} events for F2 normalization, category, tagging, and severity...")

        for idx, event in enumerate(events, 1):
            raw_item = (
                db.query(RawItem)
                .filter(RawItem.event_id == event.id)
                .first()
            )
            raw_summary = (raw_item.summary or raw_item.content_text or "") if raw_item else ""
            source = raw_item.source if raw_item else None
            src_type = source.type if source else ""
            src_slug = source.slug if source else ""

            # Normalize title
            old_title = event.canonical_title
            new_title = normalize_event_title(old_title)
            event.canonical_title = new_title

            # Category & breaking
            cat, is_breaking = classify_event_category(
                title=new_title,
                text=raw_summary,
                source_type=src_type,
                source_slug=src_slug,
            )
            event.category = cat
            event.is_breaking = is_breaking

            # Tagging: populate EventTopics
            matched_topics = populate_event_topics(
                db=db,
                event=event,
                raw_item=raw_item,
                source=source,
            )

            # Severity score
            sev = calculate_severity_score(
                category=cat,
                is_breaking=is_breaking,
                raw_metadata=raw_item.raw_metadata if raw_item else None,
                source_slug=src_slug,
                published_at=event.published_at,
                matched_topics_count=len(matched_topics),
                text=f"{new_title} {raw_summary}",
            )
            event.severity_score = sev

            if idx % 100 == 0 or idx == len(events):
                db.commit()
                print(f"Processed {idx}/{len(events)} events...")

        db.commit()
        print("Backfill completed successfully!\n")

        # 3. Report Event Counts by Category
        category_counts = Counter(e.category for e in db.query(Event).all())
        print("=== EVENT COUNTS BY CATEGORY ===")
        for cat, cnt in sorted(category_counts.items(), key=lambda x: -x[1]):
            print(f"- {cat}: {cnt}")
        print()

        # 4. Report Top 15 Events by Severity
        top_events = (
            db.query(Event)
            .order_by(Event.severity_score.desc(), Event.published_at.desc().nullslast())
            .limit(15)
            .all()
        )
        print("=== TOP 15 EVENTS BY SEVERITY ===")
        for i, ev in enumerate(top_events, 1):
            raw = db.query(RawItem).filter(RawItem.event_id == ev.id).first()
            src_name = raw.source.name if raw and raw.source else "Unknown"
            print(f"{i:2d}. [Score: {ev.severity_score:3d}] [{ev.category.upper()}] (Breaking: {ev.is_breaking}) {ev.canonical_title[:70]} | Source: {src_name}")
        print()

        # 5. Report 10 Sample Events with Tags
        sample_events = (
            db.query(Event)
            .join(EventTopic, Event.id == EventTopic.event_id)
            .distinct()
            .limit(10)
            .all()
        )
        print("=== 10 SAMPLE EVENTS WITH TAGS ===")
        for i, ev in enumerate(sample_events, 1):
            topics = (
                db.query(EventTopic, FocusTopic)
                .join(FocusTopic, EventTopic.topic_id == FocusTopic.id)
                .filter(EventTopic.event_id == ev.id)
                .all()
            )
            tags_str = ", ".join(f"{ft.name} (conf: {et.confidence:.2f}, ver: {et.version or 'none'})" for et, ft in topics)
            print(f"{i:2d}. Title: {ev.canonical_title[:65]}")
            print(f"    Category: {ev.category} | Severity: {ev.severity_score} | Breaking: {ev.is_breaking}")
            print(f"    Tags: {tags_str or 'No tags'}")
            print()

    finally:
        db.close()


if __name__ == "__main__":
    run_backfill()
