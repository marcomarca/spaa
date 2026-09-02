from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SPAA_", env_file=".env", extra="ignore")

    app_name: str = "SPAA - Sistema Personal de Audiolibros y Aprendizaje"
    environment: str = "development"
    host: str = "0.0.0.0"
    port: int = 8009

    # Paths
    base_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parent.parent.parent.parent
    )
    data_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parent.parent.parent.parent / "data"
    )

    # Audio & QA
    mp3_bitrate_kbps: int = 96
    mp3_sample_rate_hz: int = 44100
    mp3_channels: int = 1  # Mono
    max_chunk_words: int = 950
    target_chunk_words: int = 850

    # TTS Queue Leases & Retries
    lease_duration_seconds: int = 300  # 5 minutes default lease
    heartbeat_interval_seconds: int = 30
    retry_delay_1_seconds: int = 300  # 5 minutes
    retry_delay_2_seconds: int = 1800  # 30 minutes
    max_retries_before_waiting: int = 3

    # Database
    sqlite_db_path: Path | None = None

    @property
    def db_file(self) -> Path:
        if self.sqlite_db_path:
            return self.sqlite_db_path
        return self.data_dir / "spaa_master.sqlite"

    @property
    def library_dir(self) -> Path:
        return self.data_dir / "library"

    @property
    def temporary_dir(self) -> Path:
        return self.data_dir / "temporary"

    @property
    def gemini_inbox_dir(self) -> Path:
        return self.data_dir / "gemini-inbox"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.library_dir.mkdir(parents=True, exist_ok=True)
        self.temporary_dir.mkdir(parents=True, exist_ok=True)
        self.gemini_inbox_dir.mkdir(parents=True, exist_ok=True)
        self.backups_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
