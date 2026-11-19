"""Tests for search endpoint contracts:
1. GET /api/briefings/search is removed (Task 6.9) and returns 404.
2. GET /api/topics/search queries focus_topics + topic_aliases with prefix/alias matching and limit 10.
"""

import pytest
from fastapi.testclient import TestClient

import app.database as app_db
from app.main import app
from app.models import FocusTopic, TopicAlias


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def seeded_search_data():
    """Seed canonical focus topics and aliases for topics autocomplete tests."""
    db = app_db.SessionLocal()
    try:
        # Clean up any prior test topics we create
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

        db.commit()
        yield
    finally:
        # Teardown test rows cleanly
        for slug in existing_slugs:
            t = db.query(FocusTopic).filter(FocusTopic.slug == slug).first()
            if t:
                db.delete(t)
        db.commit()
        db.close()


def test_briefings_search_endpoint_removed_returns_404(client):
    resp = client.get("/api/briefings/search", params={"q": "ZetaDockerSearch"})
    assert resp.status_code == 404


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
