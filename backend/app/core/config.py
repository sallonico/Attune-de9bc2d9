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
    # rule-based extraction). The Duke Gateway LLM is an OPTIONAL enhancement,
    # OFF by default — enabling it can cost budget unless your key has the free
    # "Mistral on-site". Flip DRUG_AI_ENABLED=true only with a free/cheap model.
    DRUG_AI_ENABLED: bool = False
    LITELLM_TOKEN: str = ""
    LITELLM_MODEL: str = "Mistral on-site"
    LITELLM_BASE_URL: str = "https://litellm.oit.duke.edu/v1"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
