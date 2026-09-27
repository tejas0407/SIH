"""Central configuration. Every tunable in the pipeline is surfaced here so the
system can run fully offline inside docker compose with no external services."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Application ---
    APP_ENV: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "DILRMP Intelligent Land Record Digitization"

    # --- Postgres ---
    POSTGRES_USER: str = "dilrmp"
    POSTGRES_PASSWORD: str = "dilrmp_dev_password"
    POSTGRES_DB: str = "land_records"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    # --- Redis / Celery ---
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"
    HITL_QUEUE_KEY: str = "hitl:review:queue"

    # --- MinIO ---
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = "localhost:9000"
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "minioadmin"
    MINIO_SECURE: bool = False
    # Scheme for the browser-facing presigned URLs; defaults to MINIO_SECURE.
    # Differs when a TLS-terminating proxy sits in front of a plain-HTTP MinIO.
    MINIO_PUBLIC_SECURE: bool | None = None
    # Fixing the region stops the MinIO client from making a bucket-location
    # request before it can sign a URL. That request goes to the *public*
    # endpoint, which is usually unreachable from inside the container.
    MINIO_REGION: str = "us-east-1"
    MINIO_BUCKET_RAW: str = "raw-scans"
    MINIO_BUCKET_TILES: str = "processed-tiles"
    MINIO_BUCKET_CERTS: str = "signed-certificates"

    # --- Pipeline thresholds ---
    AUTO_COMMIT_THRESHOLD: float = 0.85
    AREA_TOLERANCE_SQM: float = 0.005
    SHARE_TOLERANCE_PCT: float = 0.01
    TARGET_DPI: int = 300
    MAX_DESKEW_ANGLE: float = 45.0

    # --- OCR ---
    OCR_LANGUAGES: str = "hi,mr,en"
    TROCR_MODEL: str = "microsoft/trocr-base-handwritten"
    OFFLINE_MODE: bool = True

    # --- Security ---
    AADHAAR_HASH_SALT: str = "change-me-in-production"

    # --- Auth ---
    # Signs the reviewer session token. Override in .env for any real deployment;
    # the demo value keeps `docker compose up` working with no extra setup.
    JWT_SECRET_KEY: str = "dev-only-change-me-dilrmp-session-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 720  # one working shift

    @property
    def async_database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def sync_database_url(self) -> str:
        """Celery workers run synchronous sessions."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def ocr_lang_list(self) -> list[str]:
        return [lang.strip() for lang in self.OCR_LANGUAGES.split(",") if lang.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
