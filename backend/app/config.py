import logging
import os
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("becon.config")

SUPABASE_URL_PATH_ERROR = (
    "SUPABASE_URL must be the project root like https://<ref>.supabase.co, remove the path"
)


def normalize_supabase_url(raw_url: str | None) -> tuple[str | None, str | None]:
    """Validate and normalize SUPABASE_URL to bare project root (scheme + host, no trailing slash or path).

    Returns:
        (normalized_url, error_message). On success, error_message is None.
    """
    trimmed = (raw_url or "").strip()
    if not trimmed:
        return None, "SUPABASE_URL is empty or unset."

    parsed = urlparse(trimmed)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None, "SUPABASE_URL must be a valid http(s) project root like https://<ref>.supabase.co"

    if (parsed.path and parsed.path != "/") or parsed.query or parsed.fragment:
        return None, SUPABASE_URL_PATH_ERROR

    normalized = f"{parsed.scheme}://{parsed.netloc}"
    return normalized, None


# Resolve backend directory for .env location
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_FILE_PATH = os.path.join(BACKEND_DIR, ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: Literal["development", "production", "test"] = "development"
    DATABASE_URL: str = Field(default="sqlite:///./becon.db")
    ALLOWED_ORIGINS: str = Field(default="http://localhost:3000,http://127.0.0.1:3000")
    ENABLE_DOCS: bool = Field(default=True)
    GEMINI_API_KEY: str | None = Field(default=None)
    GEMINI_MODEL: str = Field(default="gemini-2.5-flash", description="Gemini model name for card generation and AI services")
    INGEST_API_TOKEN: str | None = Field(default=None)
    LOG_LEVEL: str = Field(default="INFO")
    FEED_CACHE_TTL_SECONDS: int = Field(default=1800, description="Stale-while-revalidate TTL in seconds")
    # Optional API keys for advisory source rate limits (Task 2.3)
    GITHUB_TOKEN: str | None = Field(default=None, description="Optional GitHub API token for higher advisory rate limits")
    NVD_API_KEY: str | None = Field(default=None, description="Optional NVD API key for higher CVE rate limits")

    # Scheduler and Source Fetching settings (Task 2.4)
    SCHEDULER_ENABLED: bool = Field(default=True, description="Enable periodic background scheduler")
    SCHEDULER_TICK_SECONDS: int = Field(default=10, ge=1, description="Interval between scheduler due checks")
    FETCH_GLOBAL_CONCURRENCY: int = Field(default=4, ge=1, le=32, description="Maximum concurrent active source fetches")
    FETCH_SOURCE_TIMEOUT_SECONDS: int = Field(default=45, ge=5, le=300, description="Hard cap timeout per source fetch")
    FETCH_MAX_BACKOFF_MINUTES: int = Field(default=360, ge=1, description="Maximum exponential retry backoff cap in minutes")
    FETCH_FAILING_THRESHOLD: int = Field(default=10, ge=1, description="Consecutive failure threshold to mark source status as failing")

    # Rate limiting & Gemini quota caps (in-process; use Redis/shared store when horizontally scaled)
    RATE_LIMIT_ENABLED: bool = Field(default=True)
    RATE_LIMIT_PUBLIC_PER_MIN: int = Field(default=30, ge=1)
    RATE_LIMIT_AUTH_AI_PER_MIN: int = Field(default=10, ge=1)
    GUEST_AI_PER_MIN: int = Field(default=2, ge=1)
    GEMINI_DAILY_CAP_PER_USER: int = Field(default=25, ge=1)
    GEMINI_DAILY_CAP_GUEST: int = Field(default=3, ge=1)
    GEMINI_DAILY_CAP_ALL_GUESTS: int = Field(default=30, ge=1)
    GEMINI_DAILY_CAP_GLOBAL: int = Field(default=200, ge=1)
    INGEST_MAX_GEMINI_CALLS_PER_RUN: int = Field(default=25, ge=0)
    # Output token ceilings for every Gemini call
    GEMINI_MAX_OUTPUT_TOKENS_CARD: int = Field(default=650, ge=64, le=4096)
    GEMINI_MAX_OUTPUT_TOKENS_CHAT: int = Field(default=400, ge=64, le=4096)
    GEMINI_MAX_OUTPUT_TOKENS_MATCH_TOPICS: int = Field(default=200, ge=32, le=2048)
    # Comma-separated trusted reverse proxy IPs allowed to supply X-Forwarded-For (empty = ignore XFF)
    TRUSTED_PROXIES: str = Field(default="")

    # --- Email Digest & Resend Delivery (Task F7) ---
    RESEND_API_KEY: str | None = Field(default=None)
    EMAIL_FROM: str = Field(default="Becon <digest@becon.dev>")
    APP_BASE_URL: str = Field(default="http://localhost:3000")
    UNSUBSCRIBE_SECRET: str = Field(default="dev-unsubscribe-secret-change-in-production")
    RESEND_WEBHOOK_SECRET: str | None = Field(default=None)
    DIGEST_MAX_PER_RUN: int = Field(default=10, ge=1, le=100)
    DIGEST_SCHEDULER_ENABLED: bool = Field(default=True)

    # Supabase Authentication settings
    # Project URL, e.g. https://your-project.supabase.co
    SUPABASE_URL: str | None = Field(default=None)
    # Optional legacy HS256 secret (for older projects using shared secret instead of asymmetric JWKS)
    SUPABASE_JWT_SECRET: str | None = Field(default=None)
    # Optional backend-only service role / secret key used for administrative actions (e.g. DELETE user)
    # NEVER expose this key to the frontend, client applications, or version control.
    SUPABASE_SERVICE_ROLE_KEY: str | None = Field(default=None)
    # Expected JWT audience claim (defaults to "authenticated")
    SUPABASE_JWT_AUDIENCE: str = Field(default="authenticated")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def trusted_proxies_set(self) -> set[str]:
        return {p.strip() for p in self.TRUSTED_PROXIES.split(",") if p.strip()}

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        raw_url = (self.SUPABASE_URL or "").strip()
        if not raw_url:
            if self.ENVIRONMENT.lower() == "production":
                raise ValueError("Production safety violation: SUPABASE_URL must be configured in production.")
            return self

        normalized, err = normalize_supabase_url(raw_url)
        if err:
            if self.ENVIRONMENT.lower() == "production":
                raise ValueError(f"Production safety violation: {err}")
            logger.error(err)
            return self

        self.SUPABASE_URL = normalized
        return self


settings = Settings()
