from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_ENV: str = "development"
    PORT: int = 8000
    MONGODB_URI: str
    MONGODB_DB: str = "attune"
    JWT_SECRET: str = "change-me-in-prod"
    JWT_EXPIRES_IN: int = 604800
    CORS_ORIGINS: str = "http://localhost:3000"

    # Medication-timing suggestions are FREE by default (RxNorm + OpenFDA +
    # rule-based extraction).

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
