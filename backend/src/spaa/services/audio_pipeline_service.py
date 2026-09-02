from datetime import datetime
from pathlib import Path
from typing import Any, BinaryIO, Dict

from sqlalchemy.orm import Session

from spaa.adapters.audio_processor import FFmpegAudioProcessor
from spaa.adapters.repositories import (
    ChapterRepository,
    TtsChunkRepository,
    TtsJobRepository,
    TtsWorkerRepository,
)
from spaa.adapters.storage import StorageAdapter
from spaa.domain.models import utc_now
from spaa.domain.qa_rules import AudioQARules


class AudioPipelineService:
    """Service to process delivered WAV chunks, execute QA, and compile chapter MP3s."""

    def __init__(self, db: Session):
        self.db = db
        self.storage = StorageAdapter()
        self.audio_proc = FFmpegAudioProcessor()
        self.jobs_repo = TtsJobRepository(db)
        self.chunks_repo = TtsChunkRepository(db)
        self.chapters_repo = ChapterRepository(db)
        self.workers_repo = TtsWorkerRepository(db)

    def process_chunk_wav_upload(self, job_id: str, worker_id: str, file_obj: BinaryIO) -> Dict[str, Any]:
        job = self.jobs_repo.get(job_id)
        if not job or job.worker_id != worker_id:
            return {"success": False, "error": "Job no asignado a este worker o no encontrado"}

        chunk = self.chunks_repo.get(job.chunk_id)
        if not chunk:
            return {"success": False, "error": "Chunk asociado no encontrado"}

        # 1. Save uploaded WAV to temporary storage atomically
        temp_wav_path = self.storage.get_temporary_wav_path(chunk.id)
        saved_path, sha256_hash = self.storage.save_uploaded_file_atomic(file_obj, temp_wav_path)

        # 2. Probe audio with FFmpeg / ffprobe
        probe_res = self.audio_proc.probe(saved_path)
        if probe_res.error:
            self._handle_qa_failure(job, chunk, worker_id, f"Error FFprobe: {probe_res.error}")
            return {"success": False, "error": probe_res.error}

        # 3. Apply deterministic QA Rules
        qa_res = AudioQARules.evaluate_chunk_audio(
            audio_path=saved_path,
            word_count=chunk.word_count,
            duration_seconds=probe_res.duration_seconds,
            is_silent=probe_res.is_silent,
        )

        if not qa_res.passed:
            self._handle_qa_failure(job, chunk, worker_id, qa_res.reason or "QA fallido")
            return {"success": False, "error": qa_res.reason}

        # 4. Mark chunk & job as READY
        now = utc_now()
        chunk.wav_path = str(saved_path)
        chunk.wav_sha256 = sha256_hash
        chunk.duration_seconds = probe_res.duration_seconds
        chunk.qa_status = "PASSED"
        chunk.status = "READY"
        chunk.updated_at = now

        job.status = "READY"
        job.worker_id = None
        job.claimed_at = None
        job.lease_until = None
        job.last_error = None
        job.updated_at = now

        self.workers_repo.update_heartbeat(worker_id, status="READY", job_id=None)
        self.db.commit()

        # 5. Check if all chunks of this chapter are READY
        chapter_compiled = self.check_and_compile_chapter(chunk.chapter_id)

        return {
            "success": True,
            "chunk_id": chunk.id,
            "qa_status": "PASSED",
            "duration_seconds": probe_res.duration_seconds,
            "chapter_compiled": chapter_compiled,
        }

    def check_and_compile_chapter(self, chapter_id: str) -> bool:
        chapter = self.chapters_repo.get(chapter_id)
        if not chapter:
            return False

        chunks = self.chunks_repo.list_by_chapter(chapter_id)
        if not chunks:
            return False

        # All chunks must be READY and have a valid WAV path
        all_ready = all(c.status == "READY" and c.wav_path and Path(c.wav_path).exists() for c in chunks)
        if not all_ready:
            return False

        # Target chapter MP3 path
        chapter_mp3_path = self.storage.get_chapter_audio_path(
            book_id=chapter.book_id,
            language=chunks[0].language,
            chapter_seq=chapter.sequence,
        )

        wav_paths = [Path(c.wav_path) for c in chunks if c.wav_path]

        try:
            self.audio_proc.concatenate_wavs_to_mp3(wav_paths, chapter_mp3_path)
            mp3_sha256 = self.storage.calculate_sha256(chapter_mp3_path)
            probe_mp3 = self.audio_proc.probe(chapter_mp3_path)

            self.chapters_repo.update_audio_ready(
                chapter_id=chapter.id,
                audio_path=str(chapter_mp3_path),
                sha256=mp3_sha256,
                duration=probe_mp3.duration_seconds,
            )

            # Cleanup temporary WAVs
            for p in wav_paths:
                self.storage.cleanup_temporary_wav(p)

            return True
        except Exception:
            self.db.rollback()
            return False

    def import_from_downloads_folder(
        self,
        job_id: str,
        worker_id: str,
        downloads_dir: str | None = None,
        exact_filepath: str | None = None,
        min_timestamp: float | None = None,
        max_age_seconds: int = 180,
    ) -> Dict[str, Any]:
        """Closed-loop verification and import of downloaded 'Generated Audio*.wav' file."""
        job = self.jobs_repo.get(job_id)
        if not job or job.worker_id != worker_id:
            return {"success": False, "error": "Job no asignado a este worker o no encontrado"}

        chunk = self.chunks_repo.get(job.chunk_id)
        if not chunk:
            return {"success": False, "error": "Chunk asociado no encontrado"}

        target_file: Path | None = None

        if exact_filepath:
            p = Path(exact_filepath)
            if p.exists() and p.is_file():
                target_file = p

        if not target_file:
            target_dir = Path(downloads_dir) if downloads_dir else Path.home() / "Downloads"
            if not target_dir.exists():
                return {"success": False, "error": f"Directorio de descargas no encontrado: {target_dir}"}

            wav_files = list(target_dir.glob("Generated Audio*.wav")) + list(target_dir.glob("*.wav"))
            unique_files = list({f.resolve(): f for f in wav_files}.values())
            if not unique_files:
                return {"success": False, "error": "No se encontraron archivos WAV en la carpeta de descargas"}

            now_ts = datetime.now().timestamp()
            sorted_files = sorted(unique_files, key=lambda f: f.stat().st_mtime, reverse=True)

            if min_timestamp:
                valid_time_files = [f for f in sorted_files if f.stat().st_mtime >= (min_timestamp - 5.0)]
                if not valid_time_files:
                    return {
                        "success": False,
                        "error": f"Lazo cerrado: No se detectó ninguna descarga posterior a {datetime.fromtimestamp(min_timestamp).strftime('%H:%M:%S')}",
                    }
                target_file = valid_time_files[0]
            else:
                newest = sorted_files[0]
                file_age = now_ts - newest.stat().st_mtime
                if file_age > max_age_seconds:
                    return {
                        "success": False,
                        "error": f"El archivo más reciente ({newest.name}) tiene {int(file_age)}s de antigüedad (máximo permitido: {max_age_seconds}s)",
                    }
                target_file = newest

        if target_file.stat().st_size < 1000:
            return {"success": False, "error": f"El archivo descargado está incompleto o corrupto ({target_file.stat().st_size} bytes)"}

        with open(target_file, "rb") as f:
            res = self.process_chunk_wav_upload(job_id=job_id, worker_id=worker_id, file_obj=f)

        if res.get("success"):
            res["downloaded_file"] = target_file.name

        return res

    def _handle_qa_failure(self, job, chunk, worker_id: str, reason: str):
        now = utc_now()
        job.attempts += 1
        job.last_error = f"QA Error: {reason}"
        job.worker_id = None
        job.claimed_at = None
        job.lease_until = None
        job.status = "QUEUED" if job.attempts < 3 else "WAITING_PROVIDER"
        job.updated_at = now

        chunk.qa_status = "FAILED"
        chunk.status = job.status
        chunk.updated_at = now

        self.workers_repo.update_heartbeat(worker_id, status="READY", job_id=None)
        self.db.commit()
