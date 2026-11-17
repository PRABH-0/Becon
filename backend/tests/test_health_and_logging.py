import io
import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.logging_config import DevelopmentFormatter, JSONFormatter
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_request_id_middleware(client):
    # 1. Custom incoming valid X-Request-ID header should be preserved
    valid_custom_id = "test-custom-request-id-12345.v1_alpha"
    resp = client.get("/health", headers={"X-Request-ID": valid_custom_id})
    assert resp.status_code == 200
    assert resp.headers.get("X-Request-ID") == valid_custom_id

    # 2. When no X-Request-ID is sent, one is generated and returned
    resp_gen = client.get("/health")
    assert resp_gen.status_code == 200
    generated_id = resp_gen.headers.get("X-Request-ID")
    assert generated_id is not None
    assert len(generated_id) > 10

    # 3. Invalid characters in X-Request-ID (e.g. spaces, special chars) are replaced
    invalid_id = "bad id with spaces & symbols!"
    resp_invalid = client.get("/health", headers={"X-Request-ID": invalid_id})
    assert resp_invalid.status_code == 200
    returned_id = resp_invalid.headers.get("X-Request-ID")
    assert returned_id != invalid_id
    assert len(returned_id) > 10

    # 4. Oversized X-Request-ID (>64 chars) is replaced
    oversized_id = "a" * 65
    resp_oversized = client.get("/health", headers={"X-Request-ID": oversized_id})
    assert resp_oversized.status_code == 200
    assert resp_oversized.headers.get("X-Request-ID") != oversized_id


def test_logging_formatters():
    record = logging.LogRecord(
        name="becon.test",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Sample log event",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-abc-999"

    # Development format
    dev_fmt = DevelopmentFormatter()
    dev_output = dev_fmt.format(record)
    assert "[INFO ]" in dev_output
    assert "[becon.test]" in dev_output
    assert "[req-abc-999]" in dev_output
    assert "Sample log event" in dev_output

    # Production JSON format (one JSON object per line)
    json_fmt = JSONFormatter()
    json_output = json_fmt.format(record)
    parsed = json.loads(json_output)
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "becon.test"
    assert parsed["message"] == "Sample log event"
    assert parsed["request_id"] == "req-abc-999"
    assert "timestamp" in parsed


def test_logger_does_not_log_authorization_or_secrets(client):
    log_stream = io.StringIO()
    handler = logging.StreamHandler(log_stream)
    root_logger = logging.getLogger()
    old_handlers = list(root_logger.handlers)
    root_logger.handlers = [handler]

    secret_auth_token = "Bearer sensitive-secret-jwt-token-987654321"

    try:
        # Send a request with sensitive Authorization header and X-Ingest-Token
        client.get(
            "/health",
            headers={
                "Authorization": secret_auth_token,
                "X-Ingest-Token": "secret-ingest-token-112233",
            },
        )

        log_output = log_stream.getvalue()
        # Assert neither the authorization header value nor the token appeared in the log
        assert "sensitive-secret-jwt-token" not in log_output
        assert "secret-ingest-token-112233" not in log_output
    finally:
        root_logger.handlers = old_handlers
