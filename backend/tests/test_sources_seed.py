"""Tests for Source registry model, seed data validation, and idempotency."""

import os
import tempfile
from pathlib import Path

import pytest
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.models import Source, SourceProfession, SourceTopic
from app.schemas import SourceSeedItem
from app.seed.seed import load_json, seed

BACKEND_DIR = Path(__file__).resolve().parent.parent


def get_test_alembic_config(db_url: str) -> Config:
    ini_path = BACKEND_DIR / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def test_seed_sources_count_between_25_and_40():
    """Verify curated official sources count is strictly between 25 and 40."""
    data = load_json("sources.json")
    assert 25 <= len(data) <= 40, f"Expected 25-40 sources, got {len(data)}"


def test_seed_sources_valid_schema():
    """Verify each source in sources.json strictly satisfies SourceSeedItem rules."""
    data = load_json("sources.json")
    slugs = set()
    feed_urls = set()

    for item in data:
        # Pydantic v2 schema validation
        validated = SourceSeedItem(**item)

        # Unique slugs and feed URLs
        assert validated.slug not in slugs, f"Duplicate slug: {validated.slug}"
        assert validated.feed_url not in feed_urls, f"Duplicate feed_url: {validated.feed_url}"
        slugs.add(validated.slug)
        feed_urls.add(validated.feed_url)

        # HTTPS only
        assert str(validated.homepage_url).startswith("https://"), f"{validated.slug} homepage_url not https"
        assert str(validated.feed_url).startswith("https://"), f"{validated.slug} feed_url not https"

        # Valid type and tier
        assert validated.source_type in [
            "rss",
            "atom",
            "github_release",
            "github_releases",
            "advisory",
            "changelog_html",
        ]
        assert validated.trust_tier in ["official", "vendor", "curated_creator", 1, 2, 3]

        # Non-empty topics and professions
        assert len(validated.topics) > 0, f"{validated.slug} has no topics"
        assert len(validated.professions) > 0, f"{validated.slug} has no professions"


def test_seed_sources_topics_and_professions_exist():
    """Verify all referenced topic and profession slugs exist in seed data."""
    sources = load_json("sources.json")
    topics = {t["slug"] for t in load_json("topics.json")}
    professions = {p["slug"] for p in load_json("professions.json")}

    for s in sources:
        for t in s["topics"]:
            assert t in topics, f"Unknown topic slug '{t}' in source '{s['slug']}'"
        for p in s["professions"]:
            assert p in professions, f"Unknown profession slug '{p}' in source '{s['slug']}'"


def test_seed_sources_idempotency_and_relations():
    """Verify seeder is fully idempotent and creates relations without duplicates."""
    temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    temp_path = temp_file.name
    temp_file.close()
    db_url = f"sqlite:///{temp_path}"

    cfg = get_test_alembic_config(db_url)
    command.upgrade(cfg, "head")

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        # Run 1
        summary1 = seed(db)
        sources_count1 = db.query(Source).count()
        source_topics_count1 = db.query(SourceTopic).count()
        source_profs_count1 = db.query(SourceProfession).count()

        assert sources_count1 >= 25
        assert summary1["sources"] == sources_count1
        assert summary1["source_topics"] == source_topics_count1
        assert summary1["source_professions"] == source_profs_count1

        # Run 2 (idempotency check)
        summary2 = seed(db)
        sources_count2 = db.query(Source).count()
        source_topics_count2 = db.query(SourceTopic).count()
        source_profs_count2 = db.query(SourceProfession).count()

        assert sources_count1 == sources_count2, "Sources count changed after second seed"
        assert source_topics_count1 == source_topics_count2, "Source-topics count changed after second seed"
        assert source_profs_count1 == source_profs_count2, "Source-professions count changed after second seed"
        assert summary1 == summary2, "Seed summaries differed between runs"

    finally:
        db.close()
        engine.dispose()
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def test_source_model_synonyms_and_properties():
    """Verify Source model column synonyms and helper properties."""
    source = Source(
        slug="test-synonyms",
        name="Test Synonyms",
        site_url="https://example.com",
        feed_url="https://example.com/rss",
        type="rss",
        trust_tier=1,
        fetch_interval_minutes=30,
        enabled=True,
    )

    # Synonyms read
    assert source.homepage_url == "https://example.com"
    assert source.source_type == "rss"
    assert source.poll_interval_minutes == 30
    assert source.is_active is True
    assert source.trust_tier_label == "official"

    # Synonyms write
    source.homepage_url = "https://example.org"
    assert source.site_url == "https://example.org"

    source.source_type = "atom"
    assert source.type == "atom"

    source.poll_interval_minutes = 120
    assert source.fetch_interval_minutes == 120

    source.is_active = False
    assert source.enabled is False


def test_seed_sources_invalid_item_fails():
    """Verify that invalid seed rows fail validation with clear error messages."""
    # Insecure HTTP
    with pytest.raises(ValidationError) as exc:
        SourceSeedItem(
            slug="insecure-feed",
            name="Insecure Feed",
            homepage_url="http://insecure.example.com",
            feed_url="https://example.com/feed.xml",
            source_type="rss",
            trust_tier="official",
            topics=["python"],
            professions=["software-development"],
        )
    assert "https" in str(exc.value)

    # Invalid slug characters
    with pytest.raises(ValidationError):
        SourceSeedItem(
            slug="Invalid Slug!",
            name="Bad Slug",
            homepage_url="https://example.com",
            feed_url="https://example.com/feed.xml",
            source_type="rss",
            trust_tier="official",
            topics=["python"],
            professions=["software-development"],
        )


@pytest.mark.network
def test_live_network_sources_verification():
    """Live verification of curated sources (skipped by default, run with -m network)."""
    import httpx

    from scripts.verify_sources import CANDIDATES, verify_source

    with httpx.Client() as client:
        for candidate in CANDIDATES[:5]:
            result = verify_source(candidate, client)
            assert result["is_valid"], f"Failed to fetch {candidate['slug']}: {result['error']}"
