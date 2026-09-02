from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from spaa.adapters.database import SessionLocal
from spaa.adapters.f5_tts_engine import F5TTSEngine
from spaa.services.audio_pipeline_service import AudioPipelineService
from spaa.services.tts_queue_service import TtsQueueService

logger = logging.getLogger("spaa.local_f5_worker")


class LocalF5Worker:
    """Worker secuencial local que consume la cola de SPAA y sintetiza con F5-TTS en la GPU local."""

    def __init__(
        self,
        worker_id: str = "worker-f5-local",
        profile_alias: str = "Local RTX 3070 F5-TTS",
        poll_interval_seconds: float = 2.0,
    ) -> None:
        self.worker_id = worker_id
        self.profile_alias = profile_alias
        self.poll_interval_seconds = poll_interval_seconds
        self.engine = F5TTSEngine()
        self.is_running = False

    def process_next_job(self) -> dict[str, Any] | None:
        """Reclama y procesa un único trabajo de la cola de forma síncrona."""
        db = SessionLocal()
        try:
            queue_service = TtsQueueService(db)
            pipeline_service = AudioPipelineService(db)

            # 1. Reclamar el siguiente trabajo disponible
            claimed = queue_service.claim_job(self.worker_id, self.profile_alias)
            if not claimed:
                return None

            job_id = claimed["job_id"]
            spoken_text = claimed["spoken_text"]
            voice_name = claimed.get("voice", "marco")

            logger.info(
                f"[F5 Worker] Reclamado Job {job_id[:8]} | Bloque {claimed.get('sequence')} | {len(spoken_text.split())} palabras"
            )

            # 2. Sintetizar con F5-TTS
            temp_wav_path = Path(self.engine.work_dir) / f"{job_id}.wav"
            synth_res = self.engine.synthesize(
                text=spoken_text,
                output_wav=temp_wav_path,
                voice_name=voice_name,
            )

            if not synth_res.get("success"):
                err_msg = synth_res.get("error", "Fallo desconocido en síntesis F5-TTS")
                logger.error(f"[F5 Worker] Error en Job {job_id[:8]}: {err_msg}")
                queue_service.report_error(job_id, self.worker_id, err_msg)
                return {"job_id": job_id, "success": False, "error": err_msg}

            # 3. Entregar WAV al pipeline de audio para QA y normalización
            logger.info(f"[F5 Worker] Síntesis exitosa en {synth_res.get('elapsed_seconds')}s. Validando QA...")
            process_res = pipeline_service.process_chunk_wav_file(
                job_id=job_id,
                worker_id=self.worker_id,
                file_path=temp_wav_path,
            )

            # Limpiar archivo temporal
            if temp_wav_path.exists():
                temp_wav_path.unlink(missing_ok=True)

            if process_res.get("success"):
                logger.info(
                    f"[F5 Worker] Job {job_id[:8]} GUARDADO Y COMPLETADO ✓ (Duración: {process_res.get('duration_seconds', 0):.2f}s)"
                )
                return {"job_id": job_id, "success": True, **process_res}
            else:
                err_msg = process_res.get("error", "Fallo de validación QA en audio generado")
                logger.error(f"[F5 Worker] QA falló para Job {job_id[:8]}: {err_msg}")
                return {"job_id": job_id, "success": False, "error": err_msg}

        except Exception as exc:
            logger.exception(f"[F5 Worker] Excepción no controlada procesando trabajo: {exc}")
            return {"success": False, "error": str(exc)}
        finally:
            db.close()

    async def run_loop(self) -> None:
        """Bucle continuo asíncrono de procesamiento de la cola."""
        self.is_running = True
        logger.info(f"[F5 Worker] Iniciando bucle de worker local '{self.worker_id}'...")

        while self.is_running:
            try:
                res = self.process_next_job()
                if res is None:
                    # No hay trabajos en cola, esperar intervalo
                    await asyncio.sleep(self.poll_interval_seconds)
                else:
                    # Si procesó un trabajo, continuar inmediatamente con el siguiente
                    await asyncio.sleep(0.1)
            except Exception as exc:
                logger.error(f"[F5 Worker] Error en bucle: {exc}")
                await asyncio.sleep(self.poll_interval_seconds)

    def stop(self) -> None:
        self.is_running = False
