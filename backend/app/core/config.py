"""
Application configuration, loaded from environment variables / .env file.
Never hardcode secrets — everything sensitive is read from the environment.
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "GeM Bid Compliance Verification Platform"
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "sqlite:///./gem_compliance.db"

    JWT_SECRET: str = "insecure-dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    UPLOAD_DIRECTORY: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 15

    MOCK_GOVERNMENT_API: bool = True

    AI_PROVIDER: str = "mock"  # "mock" | "llm"
    LLM_API_KEY: str = ""

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # DEMO-ONLY authentication rule: public self-registration may create an
    # ADMIN or PROCUREMENT_OFFICER account (in addition to BIDDER, which has
    # no restriction) only when the email address ends with this domain. This
    # does NOT verify mailbox ownership, send any email, or check DNS/MX
    # records — it is a format check only, intentionally, for demo purposes.
    # Centralized here so the domain can be changed (or this whole rule
    # retired) via one environment variable, without touching auth logic.
    PRIVILEGED_ROLE_EMAIL_DOMAIN: str = "cpcl.gov.in"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
