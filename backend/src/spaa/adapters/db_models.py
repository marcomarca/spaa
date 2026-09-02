from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from spaa.adapters.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BookModel(Base):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    author: Mapped[str] = mapped_column(String(255), default="")
    mode: Mapped[str] = mapped_column(String(32), default="auto")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    variants: Mapped[list["BookVariantModel"]] = relationship(back_populates="book", cascade="all, delete-orphan")
    chapters: Mapped[list["ChapterModel"]] = relationship(back_populates="book", cascade="all, delete-orphan")


class BookVariantModel(Base):
    __tablename__ = "book_variants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    book_id: Mapped[str] = mapped_column(String(36), ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    language: Mapped[str] = mapped_column(String(8), default="es")
    source_filename: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    book: Mapped["BookModel"] = relationship(back_populates="variants")
    chapters: Mapped[list["ChapterModel"]] = relationship(back_populates="variant", cascade="all, delete-orphan")


class ChapterModel(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    book_id: Mapped[str] = mapped_column(String(36), ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    variant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("book_variants.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_text: Mapped[str] = mapped_column(Text, default="")
    prepared_text: Mapped[str] = mapped_column(Text, default="")
    spoken_text: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    audio_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    audio_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    book: Mapped["BookModel"] = relationship(back_populates="chapters")
    variant: Mapped["BookVariantModel"] = relationship(back_populates="chapters")
    sections: Mapped[list["SectionModel"]] = relationship(back_populates="chapter", cascade="all, delete-orphan")
    chunks: Mapped[list["TtsChunkModel"]] = relationship(back_populates="chapter", cascade="all, delete-orphan")


class SectionModel(Base):
    __tablename__ = "sections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    chapter_id: Mapped[str] = mapped_column(String(36), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(255), default="")
    level: Mapped[int] = mapped_column(Integer, default=2)
    content: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)

    chapter: Mapped["ChapterModel"] = relationship(back_populates="sections")


class TtsChunkModel(Base):
    __tablename__ = "tts_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    book_id: Mapped[str] = mapped_column(String(36), nullable=False)
    variant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    chapter_id: Mapped[str] = mapped_column(String(36), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    section_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    source_text: Mapped[str] = mapped_column(Text, default="")
    spoken_text: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    language: Mapped[str] = mapped_column(String(8), default="es")
    provider: Mapped[str] = mapped_column(String(32), default="f5")
    model: Mapped[str] = mapped_column(String(64), default="f5_spanish")
    voice: Mapped[str] = mapped_column(String(64), default="marco")
    status: Mapped[str] = mapped_column(String(32), default="NEW")
    wav_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    wav_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    qa_status: Mapped[str] = mapped_column(String(32), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    chapter: Mapped["ChapterModel"] = relationship(back_populates="chunks")
    job: Mapped["TtsJobModel"] = relationship(back_populates="chunk", uselist=False, cascade="all, delete-orphan")


class TtsJobModel(Base):
    __tablename__ = "tts_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    chunk_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tts_chunks.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    status: Mapped[str] = mapped_column(String(32), default="QUEUED")
    provider: Mapped[str] = mapped_column(String(32), default="f5")
    worker_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    chunk: Mapped["TtsChunkModel"] = relationship(back_populates="job")


class TtsWorkerModel(Base):
    __tablename__ = "tts_workers"

    worker_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    profile_alias: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(32), default="READY")
    current_job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_heartbeat: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    ai_studio_url: Mapped[str] = mapped_column(String(255), default="https://aistudio.google.com/live")
    voice: Mapped[str] = mapped_column(String(64), default="Puck")


class PlaybackStateModel(Base):
    __tablename__ = "playback_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), default="default")
    book_id: Mapped[str] = mapped_column(String(36), nullable=False)
    chapter_id: Mapped[str] = mapped_column(String(36), nullable=False)
    position_ms: Mapped[int] = mapped_column(Integer, default=0)
    speed: Mapped[float] = mapped_column(Float, default=1.0)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class SyncEventModel(Base):
    __tablename__ = "sync_events"

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CheatEntryModel(Base):
    __tablename__ = "cheat_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    book_id: Mapped[str] = mapped_column(String(36), nullable=False)
    chapter_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    concept: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger: Mapped[str] = mapped_column(String(255), default="")
    rule: Mapped[str] = mapped_column(Text, default="")
    procedure: Mapped[str] = mapped_column(Text, default="")
    pitfall: Mapped[str] = mapped_column(Text, default="")
    association: Mapped[str] = mapped_column(Text, default="")
    user_version: Mapped[str] = mapped_column(Text, default="")
    chatgpt_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_for_memory: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class FsrsCardModel(Base):
    __tablename__ = "fsrs_cards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    due: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    stability: Mapped[float] = mapped_column(Float, default=1.0)
    difficulty: Mapped[float] = mapped_column(Float, default=5.0)
    state: Mapped[int] = mapped_column(Integer, default=0)  # 0=New, 1=Learning, 2=Review, 3=Relearning
    last_review: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)


class QuestionModel(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    chapter_id: Mapped[str] = mapped_column(String(36), ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    question_type: Mapped[str] = mapped_column(
        String(32), default="feynman"
    )  # feynman, why_chain, application, contrast, counterexample
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    expected_criteria: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    answers: Mapped[list["AnswerModel"]] = relationship(back_populates="question", cascade="all, delete-orphan")


class AnswerModel(Base):
    __tablename__ = "answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    user_response: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="ANSWERED")  # ANSWERED, PENDING_REVIEW, REVIEWED
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    correct_points: Mapped[str] = mapped_column(Text, default="[]")
    missing_points: Mapped[str] = mapped_column(Text, default="[]")
    misconceptions: Mapped[str] = mapped_column(Text, default="[]")
    evaluator_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    question: Mapped["QuestionModel"] = relationship(back_populates="answers")
