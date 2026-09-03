from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from spaa.adapters.database import get_db
from spaa.adapters.db_models import BookModel, ChapterModel, TtsChunkModel, TtsJobModel
from spaa.adapters.repositories import TtsJobRepository, TtsWorkerRepository
from spaa.config import settings
from spaa.services.audio_pipeline_service import AudioPipelineService
from spaa.services.tts_queue_service import TtsQueueService
from spaa.services.worker_manager import worker_manager

router = APIRouter(prefix="/api/queue", tags=["TTS Queue & Workers"])


class ClaimJobRequest(BaseModel):
    worker_id: str
    profile_alias: str = ""
    provider: str = "qwen"


class HeartbeatRequest(BaseModel):
    worker_id: str
    status: str = "READY"
    job_id: Optional[str] = None


class ReportStatusRequest(BaseModel):
    job_id: str
    worker_id: str
    status: str  # GENERATING, DOWNLOADING, ERROR
    error: Optional[str] = None


@router.post("/claim")
def claim_job(req: ClaimJobRequest, db: Session = Depends(get_db)):
    svc = TtsQueueService(db)
    claimed = svc.claim_job(
        worker_id=req.worker_id,
        profile_alias=req.profile_alias,
        provider=req.provider,
    )
    if not claimed:
        return {"job": None, "message": "No hay trabajos pendientes"}
    return {"job": claimed, "message": "Trabajo asignado exitosamente"}


@router.post("/heartbeat")
def send_heartbeat(req: HeartbeatRequest, db: Session = Depends(get_db)):
    svc = TtsQueueService(db)
    success = svc.heartbeat(
        worker_id=req.worker_id,
        status=req.status,
        job_id=req.job_id,
    )
    return {"success": success}


@router.post("/report")
def report_status(req: ReportStatusRequest, db: Session = Depends(get_db)):
    svc = TtsQueueService(db)
    if req.status == "ERROR" or req.error:
        success = svc.report_job_failure(
            job_id=req.job_id,
            worker_id=req.worker_id,
            error_message=req.error or "Error reportado por worker",
        )
    else:
        success = svc.report_job_progress(
            job_id=req.job_id,
            worker_id=req.worker_id,
            status=req.status,
        )

    if not success:
        raise HTTPException(status_code=400, detail="No se pudo actualizar el estado del trabajo")
    return {"success": True}


@router.post("/upload-wav/{job_id}")
async def upload_chunk_wav(
    job_id: str,
    worker_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    svc = AudioPipelineService(db)
    result = svc.process_chunk_wav_upload(
        job_id=job_id,
        worker_id=worker_id,
        file_obj=file.file,
    )

    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("error", "QA de audio fallido"))

    return result


class ImportDownloadRequest(BaseModel):
    worker_id: str
    downloads_dir: Optional[str] = None
    exact_filepath: Optional[str] = None
    min_timestamp: Optional[float] = None


@router.post("/import-download/{job_id}")
def import_downloaded_wav(
    job_id: str,
    req: ImportDownloadRequest,
    db: Session = Depends(get_db),
):
    svc = AudioPipelineService(db)
    result = svc.import_from_downloads_folder(
        job_id=job_id,
        worker_id=req.worker_id,
        downloads_dir=req.downloads_dir,
        exact_filepath=req.exact_filepath,
        min_timestamp=req.min_timestamp,
    )
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("error", "Error importando descarga"))
    return result


@router.get("/status")
def get_queue_status(db: Session = Depends(get_db)):
    jobs_repo = TtsJobRepository(db)
    workers_repo = TtsWorkerRepository(db)

    jobs = jobs_repo.list_all(limit=50)
    workers = workers_repo.list_active()

    return {
        "active_workers": [
            {
                "worker_id": w.worker_id,
                "profile_alias": w.profile_alias,
                "status": w.status,
                "current_job_id": w.current_job_id,
                "last_heartbeat": w.last_heartbeat.isoformat(),
            }
            for w in workers
        ],
        "jobs": [
            {
                "id": j.id,
                "chunk_id": j.chunk_id,
                "status": j.status,
                "provider": j.provider,
                "worker_id": j.worker_id,
                "attempts": j.attempts,
                "lease_until": j.lease_until.isoformat() if j.lease_until else None,
                "last_error": j.last_error,
            }
            for j in jobs
        ],
    }


@router.get("/monitor")
def get_queue_monitor(book_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Retorna el estado de todos los bloques, estadísticas acumuladas y workers para el dashboard."""
    query = (
        select(TtsChunkModel, ChapterModel, TtsJobModel, BookModel)
        .join(ChapterModel, TtsChunkModel.chapter_id == ChapterModel.id)
        .join(BookModel, ChapterModel.book_id == BookModel.id)
        .outerjoin(TtsJobModel, TtsChunkModel.id == TtsJobModel.chunk_id)
        .order_by(ChapterModel.sequence.asc(), TtsChunkModel.sequence.asc())
    )
    if book_id:
        query = query.where(TtsChunkModel.book_id == book_id)

    rows = db.execute(query).all()

    total_chunks = len(rows)
    ready_count = 0
    generating_count = 0
    queued_count = 0
    error_count = 0
    total_audio_seconds = 0.0

    chunk_items = []
    for chunk, chapter, job, book in rows:
        job_status = job.status if job else chunk.status
        if job_status == "READY":
            ready_count += 1
            total_audio_seconds += chunk.duration_seconds
        elif job_status in ["GENERATING", "CLAIMED", "DOWNLOADING"]:
            generating_count += 1
        elif job_status in ["RETRY_WAIT", "WAITING_PROVIDER", "FAILED"]:
            error_count += 1
        else:
            queued_count += 1

        chunk_items.append(
            {
                "id": chunk.id,
                "job_id": job.id if job else None,
                "book_id": book.id,
                "book_title": book.title,
                "chapter_id": chapter.id,
                "chapter_title": chapter.title,
                "chapter_sequence": chapter.sequence,
                "sequence": chunk.sequence,
                "status": job_status,
                "word_count": chunk.word_count,
                "duration_seconds": round(chunk.duration_seconds, 2),
                "voice": chunk.voice,
                "provider": chunk.provider,
                "attempts": job.attempts if job else 0,
                "last_error": job.last_error if job else None,
                "worker_id": job.worker_id if job else None,
                "spoken_preview": chunk.spoken_text[:120] if chunk.spoken_text else "",
                "spoken_text": chunk.spoken_text or "",
                "updated_at": (job.updated_at or chunk.updated_at).isoformat()
                if (job and job.updated_at) or chunk.updated_at
                else None,
            }
        )

    workers_repo = TtsWorkerRepository(db)
    active_workers = [
        {
            "worker_id": w.worker_id,
            "profile_alias": w.profile_alias,
            "status": w.status,
            "current_job_id": w.current_job_id,
            "last_heartbeat": w.last_heartbeat.isoformat(),
        }
        for w in workers_repo.list_active()
    ]

    progress_pct = round((ready_count / total_chunks * 100.0), 1) if total_chunks > 0 else 0.0

    return {
        "summary": {
            "total_chunks": total_chunks,
            "ready_count": ready_count,
            "generating_count": generating_count,
            "queued_count": queued_count,
            "error_count": error_count,
            "total_audio_seconds": round(total_audio_seconds, 2),
            "total_audio_minutes": round(total_audio_seconds / 60.0, 1),
            "progress_percentage": progress_pct,
        },
        "workers": active_workers,
        "chunks": chunk_items,
    }


@router.get("/logs")
def get_worker_logs(lines: int = 150):
    """Lee las últimas líneas del log estructurado del worker Qwen."""
    log_file = settings.data_dir / "logs" / "qwen_worker.log"
    if not log_file.exists():
        return {
            "file_exists": False,
            "file_path": str(log_file),
            "total_lines": 0,
            "file_size_bytes": 0,
            "lines": [],
        }

    try:
        content = log_file.read_text(encoding="utf-8", errors="replace")
        all_lines = [line for line in content.splitlines() if line.strip()]
        tail = all_lines[-lines:] if lines > 0 else all_lines
        return {
            "file_exists": True,
            "file_path": str(log_file),
            "total_lines": len(all_lines),
            "file_size_bytes": log_file.stat().st_size,
            "lines": tail,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error leyendo archivo de logs: {exc}")


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, db: Session = Depends(get_db)):
    """Restablece un trabajo individual fallido de vuelta a QUEUED."""
    job = db.get(TtsJobModel, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")

    now = datetime.now(timezone.utc)
    job.status = "QUEUED"
    job.attempts = 0
    job.last_error = None
    job.next_retry_at = None
    job.worker_id = None
    job.claimed_at = None
    job.lease_until = None
    job.updated_at = now

    chunk = db.get(TtsChunkModel, job.chunk_id)
    if chunk:
        chunk.status = "QUEUED"
        chunk.qa_status = "PENDING"
        chunk.updated_at = now

    db.commit()
    return {"success": True, "job_id": job_id, "status": "QUEUED"}


@router.post("/retry-failed")
def retry_all_failed_jobs(db: Session = Depends(get_db)):
    """Restablece todos los trabajos con error a QUEUED de forma masiva."""
    now = datetime.now(timezone.utc)
    failed_statuses = ["RETRY_WAIT", "WAITING_PROVIDER", "FAILED"]

    stmt_jobs = (
        update(TtsJobModel)
        .where(TtsJobModel.status.in_(failed_statuses))
        .values(
            status="QUEUED",
            attempts=0,
            last_error=None,
            next_retry_at=None,
            worker_id=None,
            claimed_at=None,
            lease_until=None,
            updated_at=now,
        )
    )
    result_jobs = db.execute(stmt_jobs)

    stmt_chunks = (
        update(TtsChunkModel)
        .where(TtsChunkModel.status.in_(failed_statuses))
        .values(status="QUEUED", qa_status="PENDING", updated_at=now)
    )
    db.execute(stmt_chunks)
    db.commit()

    return {"success": True, "reset_count": result_jobs.rowcount}


class WorkerStartRequest(BaseModel):
    speaker: str = "Ryan"
    instruct: Optional[str] = None
    poll_interval: float = 2.0


@router.get("/worker/status")
def get_worker_status() -> dict[str, Any]:
    """Retorna el estado del proceso del worker GPU administrado."""
    return worker_manager.get_status()


@router.post("/worker/start")
def start_worker(req: WorkerStartRequest = WorkerStartRequest()) -> dict[str, Any]:
    """Inicia el subproceso del worker local Qwen3-TTS para comenzar la síntesis."""
    try:
        return worker_manager.start(
            speaker=req.speaker,
            instruct=req.instruct,
            poll_interval=req.poll_interval,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error iniciando worker: {e}")


@router.post("/worker/stop")
def stop_worker() -> dict[str, Any]:
    """Detiene el subproceso del worker para liberar memoria VRAM de la GPU."""
    try:
        return worker_manager.stop()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deteniendo worker: {e}")
