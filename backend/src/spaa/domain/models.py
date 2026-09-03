from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4


class Language(str, Enum):
    ES = "es"
    EN = "en"


class TTSProvider(str, Enum):
    QWEN = "qwen"
    GEMINI = "gemini"
    F5 = "f5"
    EDGE = "edge"


DEFAULT_QWEN_INSTRUCT = (
    "Voz extremadamente energética, entusiasta y dinámica. Ritmo rápido pero claro, con mucha intención "
    "y actitud. Enfatiza las palabras clave, usa cambios naturales de entonación y evita sonar monótono. "
    "Debe sentirse como un anuncio emocionante: potente, expresivo, contagioso y con energía alta de principio a fin."
)


class BookMode(str, Enum):
    QUALITY = "quality"  # Gemini only
    AUTO = "auto"  # Qwen -> Gemini -> Edge based on urgency/buffer
    LOCAL = "local"  # Qwen


class JobStatus(str, Enum):
    NEW = "NEW"
    PREPARED = "PREPARED"
    QUEUED = "QUEUED"
    CLAIMED = "CLAIMED"
    GENERATING = "GENERATING"
    DOWNLOADED = "DOWNLOADED"
    QA_PENDING = "QA_PENDING"
    ENCODING = "ENCODING"
    READY = "READY"
    RETRY_WAIT = "RETRY_WAIT"
    WAITING_PROVIDER = "WAITING_PROVIDER"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class WorkerStatus(str, Enum):
    OFFLINE = "OFFLINE"
    READY = "READY"
    CLAIMING = "CLAIMING"
    PREPARING = "PREPARING"
    GENERATING = "GENERATING"
    DOWNLOADING = "DOWNLOADING"
    REPORTING = "REPORTING"
    PAUSED = "PAUSED"
    ERROR = "ERROR"


class QAStatus(str, Enum):
    PENDING = "PENDING"
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class ConceptLearningState(str, Enum):
    HEARD = "heard"
    SUMMARY_WRITTEN = "summary_written"
    SELECTED_FOR_MEMORY = "selected_for_memory"
    REVIEWED = "reviewed"


class FSRSRating(int, Enum):
    AGAIN = 1
    HARD = 2
    GOOD = 3
    EASY = 4


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Book:
    id: str = field(default_factory=lambda: str(uuid4()))
    title: str = ""
    author: str = ""
    mode: BookMode = BookMode.AUTO
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class BookVariant:
    id: str = field(default_factory=lambda: str(uuid4()))
    book_id: str = ""
    language: Language = Language.ES
    source_filename: str = ""
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Chapter:
    id: str = field(default_factory=lambda: str(uuid4()))
    book_id: str = ""
    variant_id: str = ""
    sequence: int = 1
    title: str = ""
    source_text: str = ""
    prepared_text: str = ""
    spoken_text: str = ""
    word_count: int = 0
    duration_seconds: float = 0.0
    audio_path: str | None = None
    audio_sha256: str | None = None
    is_ready: bool = False
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class Section:
    id: str = field(default_factory=lambda: str(uuid4()))
    chapter_id: str = ""
    sequence: int = 1
    title: str = ""
    level: int = 2
    content: str = ""
    word_count: int = 0


@dataclass
class TtsChunk:
    id: str = field(default_factory=lambda: str(uuid4()))
    book_id: str = ""
    variant_id: str = ""
    chapter_id: str = ""
    section_id: str | None = None
    sequence: int = 1
    source_text: str = ""
    spoken_text: str = ""
    word_count: int = 0
    language: Language = Language.ES
    provider: TTSProvider = TTSProvider.QWEN
    model: str = "qwen3-tts-1.7b"
    voice: str = "Ryan"
    instruct: str = DEFAULT_QWEN_INSTRUCT
    status: JobStatus = JobStatus.NEW
    wav_path: str | None = None
    wav_sha256: str | None = None
    duration_seconds: float = 0.0
    qa_status: QAStatus = QAStatus.PENDING
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class TtsJob:
    id: str = field(default_factory=lambda: str(uuid4()))
    chunk_id: str = ""
    status: JobStatus = JobStatus.QUEUED
    provider: TTSProvider = TTSProvider.QWEN
    worker_id: str | None = None
    claimed_at: datetime | None = None
    lease_until: datetime | None = None
    attempts: int = 0
    max_attempts: int = 3
    next_retry_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class TtsWorker:
    worker_id: str = ""
    profile_alias: str = ""
    status: WorkerStatus = WorkerStatus.READY
    current_job_id: str | None = None
    last_heartbeat: datetime = field(default_factory=utc_now)
    ai_studio_url: str = "https://aistudio.google.com/live"
    voice: str = "Puck"


@dataclass
class PlaybackState:
    id: str = field(default_factory=lambda: str(uuid4()))
    device_id: str = "default"
    book_id: str = ""
    chapter_id: str = ""
    position_ms: int = 0
    speed: float = 1.0
    is_completed: bool = False
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class SyncEvent:
    event_id: str = field(default_factory=lambda: str(uuid4()))
    device_id: str = ""
    event_type: str = ""
    entity_id: str = ""
    timestamp: datetime = field(default_factory=utc_now)
    payload: dict = field(default_factory=dict)
    processed_at: datetime | None = None
