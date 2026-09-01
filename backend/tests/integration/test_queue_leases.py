from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from spaa.adapters.database import Base
from spaa.adapters.db_models import TtsChunkModel, TtsJobModel
from spaa.adapters.repositories import TtsJobRepository
from spaa.services.tts_queue_service import TtsQueueService


def setup_in_memory_db() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_local()


def test_queue_claiming_and_lease_recovery():
    db = setup_in_memory_db()
    jobs_repo = TtsJobRepository(db)
    queue_svc = TtsQueueService(db)

    # Setup a sample chunk and job
    chunk = TtsChunkModel(
        id="chunk-1",
        book_id="book-1",
        variant_id="var-1",
        chapter_id="chap-1",
        sequence=1,
        source_text="Texto fuente de prueba",
        spoken_text="Texto hablado de prueba",
        word_count=4,
        language="es",
        status="QUEUED",
    )
    job = TtsJobModel(
        id="job-1",
        chunk_id="chunk-1",
        status="QUEUED",
        provider="gemini",
    )
    db.add(chunk)
    db.add(job)
    db.commit()

    # 1. Claim job with Worker A
    claimed = queue_svc.claim_job(worker_id="worker-a", profile_alias="Profile A")
    assert claimed is not None
    assert claimed["job_id"] == "job-1"
    assert claimed["spoken_text"] == "Texto hablado de prueba"

    # 2. Worker B tries to claim -> no pending jobs
    claimed_b = queue_svc.claim_job(worker_id="worker-b", profile_alias="Profile B")
    assert claimed_b is None

    # 3. Simulate Worker A disappearing and lease expiring
    job_db = jobs_repo.get("job-1")
    assert job_db is not None
    job_db.lease_until = datetime.now(timezone.utc) - timedelta(seconds=10)
    db.commit()

    # 4. Worker B claims again -> expired lease is recovered and assigned to Worker B
    claimed_b2 = queue_svc.claim_job(worker_id="worker-b", profile_alias="Profile B")
    assert claimed_b2 is not None
    assert claimed_b2["job_id"] == "job-1"

    job_db2 = jobs_repo.get("job-1")
    assert job_db2.worker_id == "worker-b"
    assert job_db2.status == "CLAIMED"
