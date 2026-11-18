import os
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    INGEST_API_TOKEN: str | None = Field(default=None)
    LOG_LEVEL: str = Field(default="INFO")
    FEED_CACHE_TTL_SECONDS: int = Field(default=1800, description="Stale-while-revalidate TTL in seconds")

    # Rate limiting & Gemini quota caps (in-process; use Redis/shared store when horizontally scaled)
    RATE_LIMIT_ENABLED: bool = Field(default=True)
    RATE_LIMIT_PUBLIC_PER_MIN: int = Field(default=30, ge=1)
    RATE_LIMIT_AUTH_AI_PER_MIN: int = Field(default=10, ge=1)
    GEMINI_DAILY_CAP_PER_USER: int = Field(default=25, ge=1)
    GEMINI_DAILY_CAP_GLOBAL: int = Field(default=200, ge=1)
    # Comma-separated trusted reverse proxy IPs allowed to supply X-Forwarded-For (empty = ignore XFF)
    TRUSTED_PROXIES: str = Field(default="")

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
        if self.ENVIRONMENT.lower() == "production":
            url = (self.SUPABASE_URL or "").strip()
            if not url:
                raise ValueError("Production safety violation: SUPABASE_URL must be configured in production.")
        return self


settings = Settings()
