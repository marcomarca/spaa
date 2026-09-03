from __future__ import annotations

import asyncio
import logging
import subprocess
import threading
from pathlib import Path
from typing import Any

from spaa.adapters.database import SessionLocal
from spaa.adapters.qwen_tts_engine import QwenTTSEngine
from spaa.services.audio_pipeline_service import AudioPipelineService
from spaa.services.tts_queue_service import TtsQueueService

logger = logging.getLogger("spaa.local_qwen_worker")


def get_gpu_temperature() -> int | None:
    """Consulta la temperatura actual de la GPU NVIDIA en grados Celsius via nvidia-smi."""
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if res.returncode == 0 and res.stdout.strip():
            return int(res.stdout.strip().split("\n")[0])
    except Exception:
        pass
    return None


class LocalQwenWorker:
    """Worker secuencial local que consume la cola de SPAA y sintetiza con Qwen3-TTS 1.7B CustomVoice en la GPU local."""

    def __init__(
        self,
        worker_id: str = "worker-qwen-local",
        profile_alias: str = "Local RTX 3070 Qwen3-TTS",
        poll_interval_seconds: float = 2.0,
        speaker: str = "Ryan",
        instruct: str | None = None,
        max_temp_celsius: int = 70,
        cooldown_temp_celsius: int = 58,
        check_thermal: bool = True,
    ) -> None:
        self.worker_id = worker_id
        self.profile_alias = profile_alias
        self.poll_interval_seconds = poll_interval_seconds
        self.max_temp_celsius = max_temp_celsius
        self.cooldown_temp_celsius = cooldown_temp_celsius
        self.check_thermal = check_thermal
        self.engine = QwenTTSEngine(
            default_speaker=speaker,
            default_instruct=instruct,
        )
        self.is_running = False

    def process_next_job(self) -> dict[str, Any] | None:
        """Reclama y procesa un único trabajo de la cola de forma síncrona."""
        db = SessionLocal()
        try:
            queue_service = TtsQueueService(db)
            pipeline_service = AudioPipelineService(db)

            # 1. Reclamar el siguiente trabajo disponible para Qwen
            claimed = queue_service.claim_job(
                worker_id=self.worker_id,
                profile_alias=self.profile_alias,
                provider="qwen",
            )
            if not claimed:
                return None

            job_id = claimed["job_id"]
            spoken_text = claimed["spoken_text"]
            speaker = claimed.get("voice") or self.engine.default_speaker
            instruct = claimed.get("instruct") or self.engine.default_instruct

            logger.info(
                f"[Qwen Worker] Reclamado Job {job_id[:8]} | Bloque {claimed.get('sequence')} | "
                f"{len(spoken_text.split())} palabras | Speaker: {speaker}"
            )

            # Actualizar estado a GENERATING
            queue_service.report_job_progress(job_id, self.worker_id, "GENERATING")

            # 2. Sintetizar con Qwen3-TTS manteniendo el lease activo con heartbeats periódicos
            temp_wav_path = Path(self.engine.work_dir) / f"{job_id}.wav"
            stop_hb = threading.Event()

            def _synthesis_heartbeat() -> None:
                while not stop_hb.wait(timeout=20.0):
                    hb_db = SessionLocal()
                    try:
                        hb_svc = TtsQueueService(hb_db)
                        hb_svc.heartbeat(self.worker_id, status="GENERATING", job_id=job_id)
                        logger.debug(f"[Qwen Worker] Heartbeat renovado para Job {job_id[:8]}")
                    except Exception as hb_err:
                        logger.warning(f"[Qwen Worker] Error emitiendo heartbeat: {hb_err}")
                    finally:
                        hb_db.close()

            hb_thread = threading.Thread(target=_synthesis_heartbeat, daemon=True)
            hb_thread.start()

            try:
                synth_res = self.engine.synthesize(
                    text=spoken_text,
                    output_wav=temp_wav_path,
                    speaker=speaker,
                    instruct=instruct,
                )
            finally:
                stop_hb.set()
                hb_thread.join(timeout=2.0)

            if not synth_res.get("success"):
                err_msg = synth_res.get("error", "Fallo desconocido en síntesis Qwen3-TTS")
                logger.error(f"[Qwen Worker] Error en Job {job_id[:8]}: {err_msg}")
                queue_service.report_job_failure(job_id, self.worker_id, err_msg)
                return {"job_id": job_id, "success": False, "error": err_msg}

            # 3. Entregar WAV al pipeline de audio para QA y normalización
            elapsed = synth_res.get("elapsed_seconds", 0)
            rtf = synth_res.get("rtf", 0)
            logger.info(f"[Qwen Worker] Síntesis completada en {elapsed}s (RTF: {rtf}x). Validando QA...")

            process_res = pipeline_service.process_chunk_wav_file(
                job_id=job_id,
                worker_id=self.worker_id,
                file_path=temp_wav_path,
            )

            # Limpiar archivo temporal si aún existe
            if temp_wav_path.exists():
                temp_wav_path.unlink(missing_ok=True)

            if process_res.get("success"):
                dur = process_res.get("duration_seconds", 0)
                logger.info(
                    f"[Qwen Worker] Job {job_id[:8]} GUARDADO Y COMPLETADO ✓ (Duración: {dur:.2f}s | "
                    f"Capítulo compilado: {process_res.get('chapter_compiled', False)})"
                )
                return {"job_id": job_id, "success": True, **process_res}
            else:
                err_msg = process_res.get("error", "Fallo de validación QA en audio generado")
                logger.error(f"[Qwen Worker] QA falló para Job {job_id[:8]}: {err_msg}")
                return {"job_id": job_id, "success": False, "error": err_msg}

        except Exception as exc:
            logger.exception(f"[Qwen Worker] Excepción no controlada procesando trabajo: {exc}")
            return {"success": False, "error": str(exc)}
        finally:
            db.close()

    async def _enforce_thermal_guard(self) -> None:
        """Verifica la temperatura de la GPU y pausa la ejecución si supera el límite de seguridad."""
        temp = get_gpu_temperature()
        if temp is None:
            return

        if temp >= self.max_temp_celsius:
            logger.warning(
                f"[Protector Térmico] 🌡️ Temperatura GPU alta: {temp}°C (umbral de pausa: {self.max_temp_celsius}°C). "
                f"Pausando para enfriar hasta <= {self.cooldown_temp_celsius}°C..."
            )
            # Reportar heartbeat con estado térmico
            db = SessionLocal()
            try:
                queue_svc = TtsQueueService(db)
                queue_svc.heartbeat(self.worker_id, status=f"PAUSED - Cooling ({temp}°C)")
            except Exception:
                pass
            finally:
                db.close()

            while self.is_running:
                await asyncio.sleep(5.0)
                cur_temp = get_gpu_temperature()
                if cur_temp is None or cur_temp <= self.cooldown_temp_celsius:
                    logger.info(
                        f"[Protector Térmico] ❄️ Enfriamiento completado: {cur_temp}°C <= {self.cooldown_temp_celsius}°C. "
                        f"Reanudando procesamiento de audiolibro."
                    )
                    break
                logger.debug(
                    f"[Protector Térmico] Enfriando... {cur_temp}°C (esperando <= {self.cooldown_temp_celsius}°C)"
                )

    async def run_loop(self) -> None:
        """Bucle continuo asíncrono de procesamiento de la cola con protección térmica."""
        self.is_running = True
        logger.info(f"[Qwen Worker] Iniciando bucle de worker local '{self.worker_id}' ({self.profile_alias})...")
        if self.check_thermal:
            init_temp = get_gpu_temperature()
            temp_str = f"{init_temp}°C" if init_temp is not None else "no detectada"
            logger.info(
                f"[Protector Térmico] ACTIVO (Temp actual: {temp_str} | Pausa: {self.max_temp_celsius}°C | "
                f"Reanudar: {self.cooldown_temp_celsius}°C)"
            )

        while self.is_running:
            try:
                res = self.process_next_job()
                if res is None:
                    # No hay trabajos pendientes para Qwen, esperar intervalo
                    await asyncio.sleep(self.poll_interval_seconds)
                else:
                    # Evaluar protector térmico al concluir el bloque generado
                    if self.check_thermal:
                        await self._enforce_thermal_guard()
                    await asyncio.sleep(0.1)
            except Exception as exc:
                logger.error(f"[Qwen Worker] Error en bucle: {exc}")
                await asyncio.sleep(self.poll_interval_seconds)

    def stop(self) -> None:
        self.is_running = False
