import os
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_SECRET_KEYS = {
    "dev-secret-key-change-in-production",
    "dev-only-change-me",
    "your_secret_key_here",
    "change-me",
    "secret",
    "secretkey",
    "default",
}

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
    SECRET_KEY: str = Field(default="dev-secret-key-change-in-production")
    DATABASE_URL: str = Field(default="sqlite:///./becon.db")
    ALLOWED_ORIGINS: str = Field(default="http://localhost:3000,http://127.0.0.1:3000")
    ENABLE_DOCS: bool = Field(default=True)
    GEMINI_API_KEY: str | None = Field(default=None)
    INGEST_API_TOKEN: str | None = Field(default=None)
    GUEST_RATE_LIMIT_PER_HOUR: int = Field(default=5)

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.ENVIRONMENT.lower() == "production":
            key = (self.SECRET_KEY or "").strip()
            if not key or key.lower() in INSECURE_SECRET_KEYS or len(key) < 16:
                raise ValueError(
                    "Production safety violation: SECRET_KEY must be set to a secure, "
                    "random secret (minimum 16 characters) and cannot use known insecure defaults."
                )
        return self


settings = Settings()
