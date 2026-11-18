"""Tests for search endpoint contracts:
1. GET /api/briefings/search returns cards in BriefingCard shape with limit/offset.
2. GET /api/topics/search queries focus_topics + topic_aliases with prefix/alias matching and limit 10.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

import app.database as app_db
from app.main import app
from app.models import Card, Event, EventTopic, FocusTopic, TopicAlias


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def seeded_search_data():
    """Seed canonical focus topics, aliases, and persisted published cards for search tests."""
    db = app_db.SessionLocal()
    try:
        # Clean up any prior test topics/cards we create
        existing_slugs = [
            "test-kubernetes",
            "test-python",
            "test-nextjs",
        ] + [f"test-prefix-topic-{i}" for i in range(15)]

        for slug in existing_slugs:
            t = db.query(FocusTopic).filter(FocusTopic.slug == slug).first()
            if t:
                db.delete(t)
        db.commit()

        k8s = FocusTopic(slug="test-kubernetes", name="Kubernetes", kind="platform", is_active=True)
        py = FocusTopic(slug="test-python", name="Python", kind="language", is_active=True)
        nextjs = FocusTopic(slug="test-nextjs", name="Next.js", kind="technology", is_active=True)
        db.add_all([k8s, py, nextjs])
        db.flush()

        db.add_all(
            [
                TopicAlias(topic_id=k8s.id, alias="k8s-test-alias"),
                TopicAlias(topic_id=nextjs.id, alias="nextjs-test-alias"),
            ]
        )

        # Create 12 topics sharing a unique prefix to test default limit=10
        for i in range(12):
            db.add(
                FocusTopic(
                    slug=f"test-prefix-topic-{i}",
                    name=f"ZetaFramework {i:02d}",
                    kind="technology",
                    is_active=True,
                )
            )

        # Create 3 published cards matching "ZetaDockerSearch" to test limit & offset
        created_event_ids = []
        for idx in range(3):
            ev = Event(
                canonical_title=f"ZetaDockerSearch Release v{idx + 1}.0",
                canonical_url=f"https://example.com/zeta-docker-{idx}",
                category="release",
                severity_score=65,
                is_breaking=False,
                first_seen_at=datetime.now(UTC),
                published_at=datetime.now(UTC),
                status="published",
            )
            db.add(ev)
            db.flush()
            created_event_ids.append(ev.id)

            db.add(EventTopic(event_id=ev.id, topic_id=k8s.id, confidence=1.0))

            card = Card(
                event_id=ev.id,
                what_happened=[f"ZetaDockerSearch v{idx + 1}.0 shipped."],
                why_it_matters="Improves container build caching.",
                how_it_affects_you="Faster CI pipelines for backend engineers.",
                action_type="apply",
                action_guidance="Upgrade base container images.",
                source_url=ev.canonical_url,
                source_text_hash=f"hash-zeta-{idx}",
                model_name="fallback-heuristic",
                prompt_version="1.0",
                validation_status="passed",
                published_at=datetime.now(UTC),
                status="published",
            )
            db.add(card)

        db.commit()
        yield
    finally:
        # Teardown test rows cleanly
        for slug in existing_slugs:
            t = db.query(FocusTopic).filter(FocusTopic.slug == slug).first()
            if t:
                db.delete(t)
        for ev in db.query(Event).filter(Event.canonical_title.like("ZetaDockerSearch%")).all():
            db.delete(ev)
        db.commit()
        db.close()


def test_briefings_search_returns_cards_with_pagination(client, seeded_search_data):
    resp = client.get("/api/briefings/search", params={"q": "ZetaDockerSearch", "limit": 2, "offset": 0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["query"] == "ZetaDockerSearch"
    assert isinstance(body["matches"], list)
    assert isinstance(body["cards"], list)
    assert len(body["cards"]) == 2

    # Verify BriefingCard shape matches /api/briefings
    card = body["cards"][0]
    assert "id" in card
    assert "title" in card
    assert "source_url" in card
    assert "card_content" in card
    cc = card["card_content"]
    assert isinstance(cc["what_happened"], list) and len(cc["what_happened"]) >= 1
    assert isinstance(cc["why_it_matters"], str) and cc["why_it_matters"]
    assert isinstance(cc["how_it_affects_you"], str) and cc["how_it_affects_you"]
    assert cc["what_to_do_next"]["action_type"] in ("learn", "apply", "avoid", "prepare")
    assert isinstance(cc["what_to_do_next"]["guidance"], str) and cc["what_to_do_next"]["guidance"]

    # Second page via offset=2 returns the remaining 1 card
    resp2 = client.get("/api/briefings/search", params={"q": "ZetaDockerSearch", "limit": 2, "offset": 2})
    assert resp2.status_code == 200
    assert len(resp2.json()["cards"]) == 1


def test_topics_search_prefix_alias_and_default_limit(client, seeded_search_data):
    # 1. Alias match (public, no auth needed)
    resp_alias = client.get("/api/topics/search", params={"q": "k8s-test-alias"})
    assert resp_alias.status_code == 200
    assert resp_alias.json()["query"] == "k8s-test-alias"
    assert "Kubernetes" in resp_alias.json()["matches"]

    # 2. Prefix match on canonical name
    resp_prefix = client.get("/api/topics/search", params={"q": "Next."})
    assert resp_prefix.status_code == 200
    assert "Next.js" in resp_prefix.json()["matches"]

    # 3. Default limit is capped at 10 even when 12 topics match
    resp_limit = client.get("/api/topics/search", params={"q": "ZetaFramework"})
    assert resp_limit.status_code == 200
    assert len(resp_limit.json()["matches"]) == 10

    # 4. No matches returns empty list
    resp_empty = client.get("/api/topics/search", params={"q": "nonexistentxyz999"})
    assert resp_empty.status_code == 200
    assert resp_empty.json()["matches"] == []
