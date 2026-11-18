"""Seed loader for Becon database.

Idempotently loads professions and focus topics from JSON data files in data/.
Safe to run repeatedly.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import FocusTopic, Profession, ProfessionTopic, TopicAlias

logger = logging.getLogger("becon.seed")
DATA_DIR = Path(__file__).resolve().parent / "data"


def load_json(filename: str) -> List[Dict[str, Any]]:
    path = DATA_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Seed data file not found: {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def seed_professions(db: Session, data: List[Dict[str, Any]]) -> Dict[str, Profession]:
    profession_map: Dict[str, Profession] = {}
    for item in data:
        slug = item["slug"]
        prof = db.query(Profession).filter(Profession.slug == slug).first()
        if not prof:
            prof = Profession(
                slug=slug,
                name=item["name"],
                description=item.get("description"),
                sort_order=item.get("sort_order", 0),
                is_active=item.get("is_active", True),
            )
            db.add(prof)
            db.flush()
        else:
            prof.name = item["name"]
            prof.description = item.get("description")
            prof.sort_order = item.get("sort_order", 0)
            prof.is_active = item.get("is_active", True)
            db.flush()
        profession_map[slug] = prof
    return profession_map


def seed_topics(
    db: Session,
    data: List[Dict[str, Any]],
    profession_map: Dict[str, Profession],
) -> Dict[str, FocusTopic]:
    topic_map: Dict[str, FocusTopic] = {}

    # Pass 1: Upsert all topics without parents
    for item in data:
        slug = item["slug"]
        topic = db.query(FocusTopic).filter(FocusTopic.slug == slug).first()
        if not topic:
            topic = FocusTopic(
                slug=slug,
                name=item["name"],
                kind=item["kind"],
                is_active=item.get("is_active", True),
            )
            db.add(topic)
            db.flush()
        else:
            topic.name = item["name"]
            topic.kind = item["kind"]
            topic.is_active = item.get("is_active", True)
            db.flush()
        topic_map[slug] = topic

    # Pass 2: Link parent_id
    for item in data:
        slug = item["slug"]
        parent_slug = item.get("parent_slug")
        if parent_slug and parent_slug in topic_map:
            topic = topic_map[slug]
            topic.parent_id = topic_map[parent_slug].id
            db.flush()

    # Pass 3: Upsert aliases and profession associations
    for item in data:
        slug = item["slug"]
        topic = topic_map[slug]

        # Aliases
        aliases = item.get("aliases", [])
        for raw_alias in aliases:
            clean_alias = raw_alias.strip().lower()
            if not clean_alias:
                continue
            existing_alias = db.query(TopicAlias).filter(TopicAlias.alias == clean_alias).first()
            if not existing_alias:
                new_alias = TopicAlias(
                    topic_id=topic.id,
                    alias=clean_alias,
                )
                db.add(new_alias)
                db.flush()
            elif existing_alias.topic_id != topic.id:
                # Repoint alias to canonical topic
                existing_alias.topic_id = topic.id
                db.flush()

        # Profession-Topic links
        target_professions = item.get("professions", [])
        for prof_slug in target_professions:
            if prof_slug in profession_map:
                prof = profession_map[prof_slug]
                link = (
                    db.query(ProfessionTopic)
                    .filter(
                        ProfessionTopic.profession_id == prof.id,
                        ProfessionTopic.topic_id == topic.id,
                    )
                    .first()
                )
                if not link:
                    link = ProfessionTopic(
                        profession_id=prof.id,
                        topic_id=topic.id,
                    )
                    db.add(link)
                    db.flush()

    return topic_map


def seed(db: Session = None) -> Dict[str, int]:
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True

    try:
        professions_data = load_json("professions.json")
        topics_data = load_json("topics.json")

        profession_map = seed_professions(db, professions_data)
        seed_topics(db, topics_data, profession_map)

        db.commit()

        # Gather final counts
        prof_count = db.query(Profession).count()
        topic_count = db.query(FocusTopic).count()
        alias_count = db.query(TopicAlias).count()
        link_count = db.query(ProfessionTopic).count()

        summary = {
            "professions": prof_count,
            "topics": topic_count,
            "aliases": alias_count,
            "profession_topics": link_count,
        }
        return summary
    except Exception as e:
        db.rollback()
        raise e
    finally:
        if close_session:
            db.close()


def run_seed() -> None:
    print("==> Seeding database with professions and focus topics...")
    summary = seed()
    print("Seed completed successfully:")
    print(f"  Professions: {summary['professions']}")
    print(f"  Focus topics: {summary['topics']}")
    print(f"  Topic aliases: {summary['aliases']}")
    print(f"  Profession-topic links: {summary['profession_topics']}")


if __name__ == "__main__":
    run_seed()
