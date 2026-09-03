from __future__ import annotations

import datetime
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger("spaa.worker_manager")


class WorkerManager:
    """Administrador de ciclo de vida del subproceso del worker Qwen3-TTS GPU.

    Permite iniciar y detener el worker directamente mediante llamadas a la API,
    liberando la memoria VRAM de la GPU cuando se detiene.
    """

    def __init__(self) -> None:
        self._process: subprocess.Popen[str] | None = None
        self._started_at: str | None = None
        self._speaker: str = "Ryan"

    @property
    def is_running(self) -> bool:
        if self._process is None:
            return False
        # poll() retorna None si el proceso sigue activo
        return self._process.poll() is None

    def get_status(self) -> dict[str, Any]:
        running = self.is_running
        pid = self._process.pid if running and self._process else None
        exit_code = None if running or not self._process else self._process.poll()

        return {
            "is_running": running,
            "pid": pid,
            "started_at": self._started_at if running else None,
            "speaker": self._speaker,
            "exit_code": exit_code,
        }

    def start(
        self,
        speaker: str = "Ryan",
        instruct: str | None = None,
        poll_interval: float = 2.0,
    ) -> dict[str, Any]:
        """Arranca el subproceso del worker local si no está ya activo."""
        if self.is_running:
            return {
                "success": True,
                "message": "El worker GPU ya está en ejecución",
                "status": self.get_status(),
            }

        # Localizar el script del runner
        # backend_dir = carpeta raíz de backend
        current_file = Path(__file__).resolve()
        backend_dir = current_file.parents[3]  # backend/
        runner_script = backend_dir / "src" / "spaa" / "runners" / "qwen_worker_runner.py"

        if not runner_script.exists():
            raise FileNotFoundError(f"No se encontró el runner del worker en {runner_script}")

        cmd = [
            sys.executable,
            str(runner_script),
            "--speaker",
            speaker,
            "--interval",
            str(poll_interval),
        ]
        if instruct:
            cmd.extend(["--instruct", instruct])

        env = os.environ.copy()
        # Asegurar que PYTHONPATH incluya src
        src_dir = str(backend_dir / "src")
        existing_pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{src_dir};{existing_pythonpath}" if existing_pythonpath else src_dir

        logger.info(f"Iniciando subproceso del worker GPU: {' '.join(cmd)}")

        try:
            self._process = subprocess.Popen(
                cmd,
                cwd=str(backend_dir),
                env=env,
                text=True,
                creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
            )
            self._started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self._speaker = speaker

            return {
                "success": True,
                "message": f"Worker GPU iniciado con éxito (PID {self._process.pid})",
                "status": self.get_status(),
            }
        except Exception as e:
            logger.error(f"Error al iniciar worker GPU: {e}", exc_info=True)
            self._process = None
            self._started_at = None
            raise RuntimeError(f"Error al iniciar subproceso del worker: {e}") from e

    def stop(self, timeout_seconds: float = 5.0) -> dict[str, Any]:
        """Detiene el subproceso del worker para liberar memoria VRAM de la GPU."""
        if not self.is_running:
            self._process = None
            self._started_at = None
            return {
                "success": True,
                "message": "El worker GPU ya estaba detenido",
                "status": self.get_status(),
            }

        proc = self._process
        assert proc is not None

        logger.info(f"Deteniendo worker GPU (PID {proc.pid})...")
        try:
            proc.terminate()
            try:
                proc.wait(timeout=timeout_seconds)
                logger.info(f"Worker GPU (PID {proc.pid}) finalizado limpiamente.")
            except subprocess.TimeoutExpired:
                logger.warning(f"Worker no respondió a terminate() en {timeout_seconds}s. Forzando kill()...")
                proc.kill()
                proc.wait(timeout=2.0)
        except Exception as e:
            logger.warning(f"Error durante detención del worker: {e}")
        finally:
            self._process = None
            self._started_at = None

        return {
            "success": True,
            "message": "Worker GPU detenido. Memoria VRAM liberada.",
            "status": self.get_status(),
        }


# Instancia singleton para compartir en el ciclo de vida de la app FastAPI
worker_manager = WorkerManager()
