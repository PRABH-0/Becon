import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.deps import get_current_user, get_optional_user
from app.main import app
from app.models import (
    Card,
    CardFeedback,
    ErrorReport,
    Event,
    SavedCard,
    UserProfile,
)
from app.rate_limit import rate_limiter

TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    rate_limiter.reset()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session):
    user = UserProfile(
        id=99,
        external_auth_id="user-test-uid",
        name="Test Engineer",
        role="Senior Backend Engineer",
        interests="Python, PostgreSQL",
        is_anonymous=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_card(db_session):
    event = Event(
        id=uuid.uuid4(),
        category="release",
        canonical_title="FastAPI 0.115 Released",
        canonical_url="https://fastapi.tiangolo.com/release-notes/",
        severity_score=75,
        status="published",
    )
    db_session.add(event)
    db_session.commit()

    card = Card(
        id=uuid.uuid4(),
        event_id=event.id,
        source_url="https://fastapi.tiangolo.com/release-notes/",
        source_text_hash="hash123",
        status="published",
        validation_status="passed",
        model_name="gemini-2.5-flash",
        prompt_version="1.0",
        published_at=datetime.now(UTC),
        what_happened=["FastAPI 0.115 is released."],
        why_it_matters="Improves response serialization speed.",
        how_it_affects_you="Upgrade your services.",
        action_type="apply",
        action_guidance="Run pip install -U fastapi.",
    )
    db_session.add(card)
    db_session.commit()
    db_session.refresh(card)
    return card


def test_save_card_requires_auth(client, test_card):
    # Without auth -> 401
    resp = client.post(f"/api/cards/{test_card.id}/save")
    assert resp.status_code == 401


def test_save_and_unsave_card_idempotent(client, db_session, test_user, test_card):
    app.dependency_overrides[get_current_user] = lambda: test_user

    # 1. First save
    resp1 = client.post(f"/api/cards/{test_card.id}/save")
    assert resp1.status_code == 200
    assert resp1.json() == {"saved": True, "card_id": str(test_card.id)}
    assert (
        db_session.query(SavedCard)
        .filter(SavedCard.user_id == test_user.id, SavedCard.card_id == test_card.id)
        .count()
        == 1
    )

    # 2. Second save (idempotent)
    resp2 = client.post(f"/api/cards/{test_card.id}/save")
    assert resp2.status_code == 200
    assert resp2.json() == {"saved": True, "card_id": str(test_card.id)}
    assert (
        db_session.query(SavedCard)
        .filter(SavedCard.user_id == test_user.id, SavedCard.card_id == test_card.id)
        .count()
        == 1
    )

    # 3. Unsave
    resp_del1 = client.delete(f"/api/cards/{test_card.id}/save")
    assert resp_del1.status_code == 200
    assert resp_del1.json() == {"saved": False, "card_id": str(test_card.id)}
    assert (
        db_session.query(SavedCard)
        .filter(SavedCard.user_id == test_user.id, SavedCard.card_id == test_card.id)
        .count()
        == 0
    )

    # 4. Unsave again (idempotent)
    resp_del2 = client.delete(f"/api/cards/{test_card.id}/save")
    assert resp_del2.status_code == 200
    assert resp_del2.json() == {"saved": False, "card_id": str(test_card.id)}


def test_get_saved_cards_paginated(client, db_session, test_user, test_card):
    app.dependency_overrides[get_current_user] = lambda: test_user

    # Initially empty
    resp_empty = client.get("/api/saved")
    assert resp_empty.status_code == 200
    data_empty = resp_empty.json()
    assert data_empty["total"] == 0
    assert len(data_empty["items"]) == 0

    # Save test card
    sc = SavedCard(user_id=test_user.id, card_id=test_card.id)
    db_session.add(sc)
    db_session.commit()

    resp = client.get("/api/saved?page=1&limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["page"] == 1
    assert data["limit"] == 10
    assert data["has_more"] is False
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == str(test_card.id)
    assert data["items"][0]["is_saved"] is True


def test_feedback_upsert_and_toggle(client, db_session, test_user, test_card):
    app.dependency_overrides[get_current_user] = lambda: test_user

    # 1. Submit useful
    r1 = client.post(f"/api/cards/{test_card.id}/feedback", json={"value": "useful"})
    assert r1.status_code == 200
    assert r1.json() == {"feedback": "useful", "card_id": str(test_card.id)}
    fb = (
        db_session.query(CardFeedback)
        .filter(CardFeedback.user_id == test_user.id, CardFeedback.card_id == test_card.id)
        .first()
    )
    assert fb is not None
    assert fb.value == 1

    # 2. Toggle off by submitting useful again
    r2 = client.post(f"/api/cards/{test_card.id}/feedback", json={"value": "useful"})
    assert r2.status_code == 200
    assert r2.json() == {"feedback": None, "card_id": str(test_card.id)}
    assert (
        db_session.query(CardFeedback)
        .filter(CardFeedback.user_id == test_user.id, CardFeedback.card_id == test_card.id)
        .count()
        == 0
    )

    # 3. Submit not_useful
    r3 = client.post(f"/api/cards/{test_card.id}/feedback", json={"value": "not_useful"})
    assert r3.status_code == 200
    assert r3.json() == {"feedback": "not_useful", "card_id": str(test_card.id)}
    fb = (
        db_session.query(CardFeedback)
        .filter(CardFeedback.user_id == test_user.id, CardFeedback.card_id == test_card.id)
        .first()
    )
    assert fb is not None
    assert fb.value == -1

    # 4. Switch from not_useful to useful
    r4 = client.post(f"/api/cards/{test_card.id}/feedback", json={"value": "useful"})
    assert r4.status_code == 200
    assert r4.json() == {"feedback": "useful", "card_id": str(test_card.id)}
    db_session.refresh(fb)
    assert fb.value == 1


def test_error_report_deduplication_and_rate_limit(client, db_session, test_user, test_card):
    app.dependency_overrides[get_optional_user] = lambda: test_user

    # 1. First report
    r1 = client.post(
        f"/api/cards/{test_card.id}/report",
        json={"reason": "Factually incorrect version", "note": "0.115 was released last month."},
    )
    assert r1.status_code == 200
    assert r1.json() == {"status": "submitted", "card_id": str(test_card.id)}
    assert (
        db_session.query(ErrorReport)
        .filter(ErrorReport.card_id == test_card.id)
        .count()
        == 1
    )

    # 2. Duplicate report (same reason)
    r2 = client.post(
        f"/api/cards/{test_card.id}/report",
        json={"reason": "Factually incorrect version", "note": "Different note same reason."},
    )
    assert r2.status_code == 200
    assert r2.json() == {"status": "deduplicated", "card_id": str(test_card.id)}
    assert (
        db_session.query(ErrorReport)
        .filter(ErrorReport.card_id == test_card.id)
        .count()
        == 1
    )

    # 3. Rate limit test (10 reports per minute)
    for i in range(8):
        client.post(
            f"/api/cards/{test_card.id}/report",
            json={"reason": f"Other issue {i}", "note": "Detail"},
        )

    # The 11th request should trigger 429
    r_limit = client.post(
        f"/api/cards/{test_card.id}/report",
        json={"reason": "Another issue", "note": "Detail"},
    )
    assert r_limit.status_code == 429


def test_briefing_response_reflects_saved_and_feedback(client, db_session, test_user, test_card):
    # Save card and add feedback
    sc = SavedCard(user_id=test_user.id, card_id=test_card.id)
    fb = CardFeedback(user_id=test_user.id, card_id=test_card.id, value=1)
    db_session.add_all([sc, fb])
    db_session.commit()

    # Authenticated request
    app.dependency_overrides[get_optional_user] = lambda: test_user
    resp = client.get("/api/briefings")
    assert resp.status_code == 200
    cards = resp.json()
    assert len(cards) >= 1
    matched = next((c for c in cards if c["id"] == str(test_card.id)), None)
    assert matched is not None
    assert matched["is_saved"] is True
    assert matched["my_feedback"] == "useful"

    # Guest / unauthenticated request
    app.dependency_overrides[get_optional_user] = lambda: None
    resp_guest = client.get("/api/briefings")
    assert resp_guest.status_code == 200
    cards_guest = resp_guest.json()
    matched_guest = next((c for c in cards_guest if c["id"] == str(test_card.id)), None)
    assert matched_guest is not None
    assert matched_guest["is_saved"] is False
    assert matched_guest["my_feedback"] is None
