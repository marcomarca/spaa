from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from spaa.adapters.repositories import (
    TtsChunkRepository,
    TtsJobRepository,
    TtsWorkerRepository,
)
from spaa.config import settings


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TtsQueueService:
    """Orchestrates TTS job claiming, lease lifecycle, heartbeats, and retry policy."""

    def __init__(self, db: Session):
        self.db = db
        self.jobs_repo = TtsJobRepository(db)
        self.chunks_repo = TtsChunkRepository(db)
        self.workers_repo = TtsWorkerRepository(db)

    def claim_job(self, worker_id: str, profile_alias: str = "", provider: str = "gemini") -> Optional[Dict[str, Any]]:
        # 1. Recover any expired leases first
        self.jobs_repo.recover_expired_leases()

        # 2. Update worker state
        self.workers_repo.get_or_create(worker_id, profile_alias)
        self.workers_repo.update_heartbeat(worker_id, status="CLAIMING")

        # 3. Find next available job
        job = self.jobs_repo.find_next_available(provider=provider)
        if not job:
            self.workers_repo.update_heartbeat(worker_id, status="READY")
            return None

        # 4. Lease the job
        now = utc_now()
        lease_until = now + timedelta(seconds=settings.lease_duration_seconds)

        job.status = "CLAIMED"
        job.worker_id = worker_id
        job.claimed_at = now
        job.lease_until = lease_until
        job.updated_at = now

        # Update chunk status
        chunk = self.chunks_repo.get(job.chunk_id)
        if chunk:
            chunk.status = "CLAIMED"
            chunk.updated_at = now

        self.db.commit()
        self.db.refresh(job)

        self.workers_repo.update_heartbeat(worker_id, status="PREPARING", job_id=job.id)

        return {
            "job_id": job.id,
            "chunk_id": chunk.id if chunk else "",
            "book_id": chunk.book_id if chunk else "",
            "chapter_id": chunk.chapter_id if chunk else "",
            "sequence": chunk.sequence if chunk else 1,
            "spoken_text": chunk.spoken_text if chunk else "",
            "word_count": chunk.word_count if chunk else 0,
            "language": chunk.language if chunk else "es",
            "provider": job.provider,
            "model": chunk.model if chunk else "gemini-2.5-pro-preview-tts",
            "voice": chunk.voice if chunk else "Puck",
            "lease_until": lease_until.isoformat(),
        }

    def heartbeat(self, worker_id: str, status: str = "READY", job_id: str | None = None) -> bool:
        self.workers_repo.update_heartbeat(worker_id, status=status, job_id=job_id)

        if job_id:
            job = self.jobs_repo.get(job_id)
            if job and job.worker_id == worker_id and job.status in ["CLAIMED", "GENERATING", "DOWNLOADING"]:
                now = utc_now()
                job.lease_until = now + timedelta(seconds=settings.lease_duration_seconds)
                job.updated_at = now
                self.db.commit()
                return True
        return True

    def report_job_progress(self, job_id: str, worker_id: str, status: str) -> bool:
        job = self.jobs_repo.get(job_id)
        if not job or job.worker_id != worker_id:
            return False

        job.status = status
        job.updated_at = utc_now()

        chunk = self.chunks_repo.get(job.chunk_id)
        if chunk:
            chunk.status = status
            chunk.updated_at = utc_now()

        self.workers_repo.update_heartbeat(worker_id, status=status, job_id=job_id)
        self.db.commit()
        return True

    def report_job_failure(self, job_id: str, worker_id: str, error_message: str) -> bool:
        job = self.jobs_repo.get(job_id)
        if not job:
            return False

        now = utc_now()
        job.attempts += 1
        job.last_error = error_message
        job.worker_id = None
        job.claimed_at = None
        job.lease_until = None
        job.updated_at = now

        # Retry policy: 1st fail -> 5m, 2nd fail -> 30m, 3rd fail -> WAITING_PROVIDER
        if job.attempts == 1:
            job.status = "RETRY_WAIT"
            job.next_retry_at = now + timedelta(seconds=settings.retry_delay_1_seconds)
        elif job.attempts == 2:
            job.status = "RETRY_WAIT"
            job.next_retry_at = now + timedelta(seconds=settings.retry_delay_2_seconds)
        else:
            job.status = "WAITING_PROVIDER"
            job.next_retry_at = None

        chunk = self.chunks_repo.get(job.chunk_id)
        if chunk:
            chunk.status = job.status
            chunk.qa_status = "FAILED"
            chunk.updated_at = now

        self.workers_repo.update_heartbeat(worker_id, status="READY", job_id=None)
        self.db.commit()
        return True
