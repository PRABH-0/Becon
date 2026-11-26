import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Card, Event, MetricsEvent, RawItem, Source, UserProfile
from app.rate_limit import rate_limiter

TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def reset_rate_limits():
    rate_limiter.reset()
    yield
    rate_limiter.reset()


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


def test_record_metrics_event_payload_size_cap(client: TestClient):
    # More than 20 keys rejected
    too_many_keys = {f"key_{i}": i for i in range(25)}
    response = client.post(
        "/api/metrics/event",
        json={"name": "card_opened", "properties": too_many_keys},
    )
    assert response.status_code == 422

    # Key > 64 chars rejected
    long_key = "k" * 70
    response = client.post(
        "/api/metrics/event",
        json={"name": "card_opened", "properties": {long_key: "value"}},
    )
    assert response.status_code == 422

    # String value > 500 chars rejected
    long_val = "v" * 505
    response = client.post(
        "/api/metrics/event",
        json={"name": "card_opened", "properties": {"valid_key": long_val}},
    )
    assert response.status_code == 422


def test_cannot_write_metrics_for_another_user(client: TestClient, db_session: Session, test_user: UserProfile):
    # Attempting to supply a user_id or spoof another user id in anonymous post
    response = client.post(
        "/api/metrics/event",
        json={
            "name": "card_opened",
            "properties": {"card_id": str(uuid.uuid4())},
            "user_id": 99999,
        },
    )
    assert response.status_code == 201
    data = response.json()
    metric = db_session.query(MetricsEvent).filter(MetricsEvent.id == uuid.UUID(data["event_id"])).first()
    assert metric is not None
    # Must be None because request was unauthenticated (caller cannot forge user_id)
    assert metric.user_id is None


def test_metrics_event_rate_limited(client: TestClient):
    # Public rate limit caps at RATE_LIMIT_PUBLIC_PER_MIN (30/min)
    for _ in range(30):
        res = client.post(
            "/api/metrics/event",
            json={"name": "card_opened", "properties": {"idx": 1}},
        )
        assert res.status_code == 201

    # 31st request triggers 429
    res_blocked = client.post(
        "/api/metrics/event",
        json={"name": "card_opened", "properties": {"idx": 2}},
    )
    assert res_blocked.status_code == 429


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
