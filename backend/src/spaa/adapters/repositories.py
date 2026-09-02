from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from spaa.adapters.db_models import (
    AnswerModel,
    BookModel,
    ChapterModel,
    PlaybackStateModel,
    QuestionModel,
    SyncEventModel,
    TtsChunkModel,
    TtsJobModel,
    TtsWorkerModel,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BookRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, book_id: str) -> Optional[BookModel]:
        return self.db.get(BookModel, book_id)

    def list_all(self) -> List[BookModel]:
        return list(self.db.scalars(select(BookModel).order_by(BookModel.created_at.desc())).all())

    def create(self, book: BookModel) -> BookModel:
        self.db.add(book)
        self.db.commit()
        self.db.refresh(book)
        return book

    def delete(self, book_id: str) -> bool:
        book = self.get(book_id)
        if book:
            self.db.delete(book)
            self.db.commit()
            return True
        return False


class ChapterRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, chapter_id: str) -> Optional[ChapterModel]:
        return self.db.get(ChapterModel, chapter_id)

    def list_by_variant(self, variant_id: str) -> List[ChapterModel]:
        stmt = select(ChapterModel).where(ChapterModel.variant_id == variant_id).order_by(ChapterModel.sequence.asc())
        return list(self.db.scalars(stmt).all())

    def create(self, chapter: ChapterModel) -> ChapterModel:
        self.db.add(chapter)
        self.db.commit()
        self.db.refresh(chapter)
        return chapter

    def update_audio_ready(
        self, chapter_id: str, audio_path: str, sha256: str, duration: float
    ) -> Optional[ChapterModel]:
        chapter = self.get(chapter_id)
        if chapter:
            chapter.audio_path = audio_path
            chapter.audio_sha256 = sha256
            chapter.duration_seconds = duration
            chapter.is_ready = True
            chapter.updated_at = utc_now()
            self.db.commit()
            self.db.refresh(chapter)
        return chapter


class TtsChunkRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, chunk_id: str) -> Optional[TtsChunkModel]:
        return self.db.get(TtsChunkModel, chunk_id)

    def list_by_chapter(self, chapter_id: str) -> List[TtsChunkModel]:
        stmt = (
            select(TtsChunkModel).where(TtsChunkModel.chapter_id == chapter_id).order_by(TtsChunkModel.sequence.asc())
        )
        return list(self.db.scalars(stmt).all())

    def update_status(self, chunk_id: str, status: str, qa_status: str | None = None) -> Optional[TtsChunkModel]:
        chunk = self.get(chunk_id)
        if chunk:
            chunk.status = status
            if qa_status:
                chunk.qa_status = qa_status
            chunk.updated_at = utc_now()
            self.db.commit()
            self.db.refresh(chunk)
        return chunk


class TtsJobRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, job_id: str) -> Optional[TtsJobModel]:
        return self.db.get(TtsJobModel, job_id)

    def get_by_chunk(self, chunk_id: str) -> Optional[TtsJobModel]:
        stmt = select(TtsJobModel).where(TtsJobModel.chunk_id == chunk_id)
        return self.db.scalar(stmt)

    def list_all(self, limit: int = 50) -> List[TtsJobModel]:
        stmt = select(TtsJobModel).order_by(TtsJobModel.created_at.desc()).limit(limit)
        return list(self.db.scalars(stmt).all())

    def find_next_available(self, provider: Optional[str] = None) -> Optional[TtsJobModel]:
        now = utc_now()
        conditions = [
            (TtsJobModel.status == "QUEUED")
            | ((TtsJobModel.status == "RETRY_WAIT") & (TtsJobModel.next_retry_at <= now)),
        ]
        if provider and provider != "any":
            conditions.append(TtsJobModel.provider == provider)

        stmt = select(TtsJobModel).where(*conditions).order_by(TtsJobModel.created_at.asc()).limit(1)
        return self.db.scalar(stmt)

    def recover_expired_leases(self) -> int:
        now = utc_now()
        stmt = (
            update(TtsJobModel)
            .where(
                TtsJobModel.status.in_(["CLAIMED", "GENERATING", "DOWNLOADING"]),
                TtsJobModel.lease_until < now,
            )
            .values(
                status="QUEUED",
                worker_id=None,
                claimed_at=None,
                lease_until=None,
                last_error="Lease expirado por inactividad o desconexión del worker",
                updated_at=now,
            )
            .execution_options(synchronize_session=False)
        )
        result = self.db.execute(stmt)
        self.db.commit()
        return result.rowcount

    def create(self, job: TtsJobModel) -> TtsJobModel:
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job


class TtsWorkerRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create(self, worker_id: str, profile_alias: str = "") -> TtsWorkerModel:
        worker = self.db.get(TtsWorkerModel, worker_id)
        if not worker:
            worker = TtsWorkerModel(
                worker_id=worker_id,
                profile_alias=profile_alias,
                status="READY",
                last_heartbeat=utc_now(),
            )
            self.db.add(worker)
            self.db.commit()
            self.db.refresh(worker)
        return worker

    def update_heartbeat(
        self, worker_id: str, status: str = "READY", job_id: str | None = None
    ) -> Optional[TtsWorkerModel]:
        worker = self.db.get(TtsWorkerModel, worker_id)
        if worker:
            worker.status = status
            worker.current_job_id = job_id
            worker.last_heartbeat = utc_now()
            self.db.commit()
            self.db.refresh(worker)
        return worker

    def list_active(self) -> List[TtsWorkerModel]:
        return list(self.db.scalars(select(TtsWorkerModel)).all())


class PlaybackRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_state(self, device_id: str, chapter_id: str) -> Optional[PlaybackStateModel]:
        stmt = select(PlaybackStateModel).where(
            PlaybackStateModel.device_id == device_id,
            PlaybackStateModel.chapter_id == chapter_id,
        )
        return self.db.scalar(stmt)

    def upsert_state(
        self,
        device_id: str,
        book_id: str,
        chapter_id: str,
        position_ms: int,
        speed: float = 1.0,
        is_completed: bool = False,
    ) -> PlaybackStateModel:
        state = self.get_state(device_id, chapter_id)
        now = utc_now()
        if not state:
            import uuid

            state = PlaybackStateModel(
                id=str(uuid.uuid4()),
                device_id=device_id,
                book_id=book_id,
                chapter_id=chapter_id,
                position_ms=position_ms,
                speed=speed,
                is_completed=is_completed,
                updated_at=now,
            )
            self.db.add(state)
        else:
            state.position_ms = position_ms
            state.speed = speed
            state.is_completed = is_completed
            state.updated_at = now
        self.db.commit()
        self.db.refresh(state)
        return state


class SyncEventRepository:
    def __init__(self, db: Session):
        self.db = db

    def exists(self, event_id: str) -> bool:
        return self.db.get(SyncEventModel, event_id) is not None

    def record_event(self, event: SyncEventModel) -> SyncEventModel:
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event


class QuestionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, question_id: str) -> Optional[QuestionModel]:
        return self.db.get(QuestionModel, question_id)

    def list_by_chapter(self, chapter_id: str) -> List[QuestionModel]:
        stmt = (
            select(QuestionModel).where(QuestionModel.chapter_id == chapter_id).order_by(QuestionModel.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def create(self, question: QuestionModel) -> QuestionModel:
        self.db.add(question)
        self.db.commit()
        self.db.refresh(question)
        return question

    def delete(self, question_id: str) -> bool:
        q = self.get(question_id)
        if q:
            self.db.delete(q)
            self.db.commit()
            return True
        return False


class AnswerRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, answer_id: str) -> Optional[AnswerModel]:
        return self.db.get(AnswerModel, answer_id)

    def list_by_question(self, question_id: str) -> List[AnswerModel]:
        stmt = select(AnswerModel).where(AnswerModel.question_id == question_id).order_by(AnswerModel.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def list_pending_reviews(self) -> List[AnswerModel]:
        stmt = select(AnswerModel).where(AnswerModel.status == "PENDING_REVIEW").order_by(AnswerModel.created_at.asc())
        return list(self.db.scalars(stmt).all())

    def create(self, answer: AnswerModel) -> AnswerModel:
        self.db.add(answer)
        self.db.commit()
        self.db.refresh(answer)
        return answer

    def update_evaluation(
        self,
        answer_id: str,
        score: float,
        correct_points: str,
        missing_points: str,
        misconceptions: str,
        feedback: str,
    ) -> Optional[AnswerModel]:
        ans = self.get(answer_id)
        if not ans:
            return None
        ans.score = score
        ans.correct_points = correct_points
        ans.missing_points = missing_points
        ans.misconceptions = misconceptions
        ans.evaluator_feedback = feedback
        ans.status = "REVIEWED"
        ans.evaluated_at = utc_now()
        self.db.commit()
        self.db.refresh(ans)
        return ans
