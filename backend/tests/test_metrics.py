import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Card, Event, MetricsEvent, RawItem, Source, UserProfile

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
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def test_user(db_session: Session) -> UserProfile:
    user = UserProfile(
        id=12345,
        external_auth_id=str(uuid.uuid4()),
        email="telemetry_test@example.com",
        role="Backend Engineer",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def sample_card(db_session: Session) -> Card:
    source = Source(
        id=uuid.uuid4(),
        slug="telemetry-src",
        name="Telemetry Source",
        site_url="https://example.com",
        feed_url="https://example.com/feed.xml",
        type="rss",
        enabled=True,
    )
    db_session.add(source)
    db_session.flush()

    raw_item = RawItem(
        id=uuid.uuid4(),
        source_id=source.id,
        url="https://example.com/post-1",
        url_hash="hash123",
        title="Telemetry Post",
        content_text="Some text",
    )
    db_session.add(raw_item)
    db_session.flush()

    event = Event(
        id=uuid.uuid4(),
        canonical_title="Telemetry Event",
        canonical_url="https://example.com/post-1",
        category="security",
        severity_score=50,
    )
    db_session.add(event)
    db_session.flush()

    card = Card(
        id=uuid.uuid4(),
        event_id=event.id,
        what_happened=["Claim 1", "Claim 2"],
        why_it_matters="Matters for telemetry",
        how_it_affects_you="Affects your telemetry",
        action_type="learn",
        action_guidance="Learn how telemetry works",
        source_url="https://example.com/post-1",
        source_text_hash="hash123",
        model_name="fallback-heuristic",
        prompt_version="1.0",
        validation_status="passed",
        status="published",
    )
    db_session.add(card)
    db_session.commit()
    db_session.refresh(card)
    return card


def test_record_metrics_event_anonymous(client: TestClient, db_session: Session):
    response = client.post(
        "/api/metrics/event",
        json={
            "name": "briefing_viewed",
            "properties": {"count": 5, "scope": "top"},
            "session_id": "sess_anon_123",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "recorded"
    event_id = uuid.UUID(data["event_id"])

    metric = db_session.query(MetricsEvent).filter(MetricsEvent.id == event_id).first()
    assert metric is not None
    assert metric.name == "briefing_viewed"
    assert metric.properties == {"count": 5, "scope": "top"}
    assert metric.session_id == "sess_anon_123"
    assert metric.user_id is None


def test_record_metrics_event_invalid_name(client: TestClient):
    response = client.post(
        "/api/metrics/event",
        json={
            "name": "invalid_event_name",
            "properties": {},
        },
    )
    assert response.status_code == 422


def test_record_metrics_event_properties_sanitized(client: TestClient, db_session: Session):
    long_string = "x" * 1000
    long_key = "k" * 100
    response = client.post(
        "/api/metrics/event",
        json={
            "name": "card_opened",
            "properties": {
                long_key: long_string,
                "numeric": 42,
                "boolean": True,
            },
        },
    )
    assert response.status_code == 201
    data = response.json()
    metric = db_session.query(MetricsEvent).filter(MetricsEvent.id == uuid.UUID(data["event_id"])).first()
    assert metric is not None
    assert len(list(metric.properties.keys())[0]) <= 64
    first_val = list(metric.properties.values())[0]
    assert len(first_val) <= 500


def test_save_card_records_metric(client: TestClient, db_session: Session, sample_card: Card, test_user: UserProfile):
    from app.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: test_user
    try:
        response = client.post(f"/api/cards/{sample_card.id}/save")
        assert response.status_code == 200

        metric = (
            db_session.query(MetricsEvent)
            .filter(MetricsEvent.name == "card_saved", MetricsEvent.user_id == test_user.id)
            .first()
        )
        assert metric is not None
        assert metric.properties.get("card_id") == str(sample_card.id)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
