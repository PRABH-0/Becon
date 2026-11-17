import contextvars
import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

# Context variable for tracing request IDs across async boundaries
request_id_ctx_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")


class RequestIdFilter(logging.Filter):
    """
    Injects request_id from contextvars into every LogRecord.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx_var.get("") or "-"
        return True


class JSONFormatter(logging.Formatter):
    """
    Formats log records as one JSON object per line for production environments.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }

        # Include standard request telemetry if present
        for key in ("method", "path", "status_code", "duration_ms"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class DevelopmentFormatter(logging.Formatter):
    """
    Formats log records as readable human-friendly text for development and testing.
    """

    def format(self, record: logging.LogRecord) -> str:
        req_id = getattr(record, "request_id", "-")
        req_part = f" [{req_id}]" if req_id != "-" else ""
        time_str = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
        msg = record.getMessage()

        if record.exc_info:
            msg += "\n" + self.formatException(record.exc_info)

        return f"{time_str} [{record.levelname:<5}] [{record.name}]{req_part} {msg}"


def setup_logging(environment: str = "development", log_level: str = "INFO") -> None:
    """
    Configures the root logger with environment-appropriate formatters and handlers.
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove existing handlers to avoid duplicates on reloads
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(numeric_level)
    stream_handler.addFilter(RequestIdFilter())

    if environment.lower() == "production":
        stream_handler.setFormatter(JSONFormatter())
    else:
        stream_handler.setFormatter(DevelopmentFormatter())

    root_logger.addHandler(stream_handler)

    # Silence overly verbose external libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("passlib").setLevel(logging.WARNING)
