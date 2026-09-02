from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from spaa.adapters.database import get_db
from spaa.adapters.repositories import TtsJobRepository, TtsWorkerRepository
from spaa.services.audio_pipeline_service import AudioPipelineService
from spaa.services.tts_queue_service import TtsQueueService

router = APIRouter(prefix="/api/queue", tags=["TTS Queue & Workers"])


class ClaimJobRequest(BaseModel):
    worker_id: str
    profile_alias: str = ""
    provider: str = "gemini"


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
