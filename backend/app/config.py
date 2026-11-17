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

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.ENVIRONMENT.lower() == "production":
            url = (self.SUPABASE_URL or "").strip()
            if not url:
                raise ValueError(
                    "Production safety violation: SUPABASE_URL must be configured in production."
                )
        return self


settings = Settings()
