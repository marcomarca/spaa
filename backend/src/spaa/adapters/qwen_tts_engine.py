from __future__ import annotations

import json
import logging
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from spaa.domain.models import DEFAULT_QWEN_INSTRUCT

logger = logging.getLogger("spaa.qwen_tts_engine")

VALID_SPEAKERS = {
    "Ryan",
    "Aiden",
    "Vivian",
    "Serena",
    "Uncle_Fu",
    "Dylan",
    "Eric",
    "Ono_Anna",
    "Sohee",
}


class QwenTTSEngine:
    """Motor de inferencia local para Qwen3-TTS 12Hz 1.7B CustomVoice en GPU NVIDIA."""

    def __init__(
        self,
        base_dir: Path | None = None,
        default_speaker: str = "Ryan",
        default_instruct: str | None = None,
        chunk_words: int = 90,
        gap_seconds: float = 0.20,
    ) -> None:
        self.base_dir = (base_dir or Path(__file__).resolve().parents[4]).resolve()
        self.qwen_dir = self.base_dir / "qwen3tts"
        self.model_dir = self.qwen_dir / "models" / "Qwen3-TTS-12Hz-1.7B-CustomVoice"
        self.cli_script = self.qwen_dir / "cli_synthesize.py"
        self.work_dir = self.base_dir / "data" / "qwen_work"
        self.work_dir.mkdir(parents=True, exist_ok=True)

        self.default_speaker = default_speaker if default_speaker in VALID_SPEAKERS else "Ryan"
        self.default_instruct = default_instruct or DEFAULT_QWEN_INSTRUCT
        self.chunk_words = chunk_words
        self.gap_seconds = gap_seconds

        self.python_exe = self._resolve_python_executable()

    def _resolve_python_executable(self) -> str:
        """Localiza el intérprete de Python con PyTorch CUDA y Transformers."""
        candidates = [
            self.qwen_dir / ".venv" / "python.exe",
            self.qwen_dir / ".venv" / "Scripts" / "python.exe",
            Path(r"C:\pinokio\api\Ultimate-TTS-Studio.git\app\tts_env\python.exe"),
        ]
        for cand in candidates:
            if cand.exists():
                return str(cand)
        return sys.executable

    def is_model_available(self) -> bool:
        """Verifica si el checkpoint local de Qwen3-TTS 1.7B CustomVoice existe."""
        config_file = self.model_dir / "config.json"
        return config_file.exists() and config_file.stat().st_size > 0

    def synthesize(
        self,
        text: str,
        output_wav: Path,
        speaker: str | None = None,
        instruct: str | None = None,
        seed: int = -1,
        max_new_tokens: int = 2048,
    ) -> dict[str, Any]:
        """Sintetiza un bloque de texto en audio WAV usando Qwen3-TTS."""
        text = text.strip()
        if not text:
            return {"success": False, "error": "El texto para síntesis está vacío"}

        if not self.is_model_available():
            return {
                "success": False,
                "error": f"Modelo Qwen3-TTS no disponible en {self.model_dir}. Se requiere config.json",
            }

        spk = speaker if speaker in VALID_SPEAKERS else self.default_speaker
        inst = instruct.strip() if instruct and instruct.strip() else self.default_instruct

        output_wav = Path(output_wav).resolve()
        output_wav.parent.mkdir(parents=True, exist_ok=True)

        session_id = f"qwen_{int(time.time() * 1000)}"
        run_dir = self.work_dir / session_id
        run_dir.mkdir(parents=True, exist_ok=True)

        text_file = run_dir / "prompt.txt"
        text_file.write_text(text, encoding="utf-8")

        instruct_file = run_dir / "instruct.txt"
        instruct_file.write_text(inst, encoding="utf-8")

        cmd = [
            self.python_exe,
            str(self.cli_script),
            "--text_file",
            str(text_file),
            "--instruct_file",
            str(instruct_file),
            "--output",
            str(output_wav),
            "--speaker",
            spk,
            "--chunk_words",
            str(self.chunk_words),
            "--gap",
            str(self.gap_seconds),
            "--seed",
            str(seed),
            "--max_new_tokens",
            str(max_new_tokens),
        ]

        words_count = len(text.split())
        # Timeout dinámico: mínimo 900s (15 min), o ~4s por palabra + 240s margen de carga de modelo
        timeout_seconds = max(900, int(words_count * 4.0) + 240)

        logger.info(
            f"[Qwen Engine] Iniciando síntesis CLI: {words_count} palabras | Speaker: {spk} | "
            f"Chunk words: {self.chunk_words} | Timeout: {timeout_seconds}s"
        )

        started = time.time()
        stdout_lines: list[str] = []
        stderr_lines: list[str] = []
        payload: dict[str, Any] = {}

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(self.qwen_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )

            # Leer stdout línea por línea en tiempo real para logging continuo sin búfer
            assert proc.stdout is not None
            for raw_line in proc.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                stdout_lines.append(line)

                if line.startswith("[PROGRESS]"):
                    progress_msg = line.replace("[PROGRESS]", "").strip()
                    logger.info(f"[Qwen Engine] {progress_msg}")
                elif line.startswith("{") and line.endswith("}"):
                    try:
                        parsed = json.loads(line)
                        if isinstance(parsed, dict) and "success" in parsed:
                            payload = parsed
                    except json.JSONDecodeError:
                        pass

            # Esperar a que el proceso termine dentro del timeout
            rem_timeout = max(10, timeout_seconds - int(time.time() - started))
            try:
                proc.wait(timeout=rem_timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
                raise subprocess.TimeoutExpired(cmd, timeout_seconds)

            if proc.stderr:
                for raw_err in proc.stderr:
                    err_line = raw_err.strip()
                    if err_line:
                        stderr_lines.append(err_line)

            elapsed = round(time.time() - started, 2)

            if proc.returncode != 0 or not payload.get("success"):
                err_msg = payload.get("error")

                # Si no hubo JSON de error, inspeccionar stderr filtrando advertencias inocuas
                if not err_msg and stderr_lines:
                    filtered_stderr = [
                        line_text
                        for line_text in stderr_lines
                        if not any(
                            ign in line_text
                            for ign in [
                                "Redirects are currently not supported",
                                "pkg_resources is deprecated",
                                "Setting `pad_token_id`",
                            ]
                        )
                    ]
                    if filtered_stderr:
                        err_msg = "\n".join(filtered_stderr).strip()

                if not err_msg:
                    err_msg = "\n".join(stdout_lines[-10:]) or f"Código de salida {proc.returncode}"

                logger.error(
                    f"[Qwen Engine] Fallo en CLI Qwen3-TTS tras {elapsed}s (code {proc.returncode}): {err_msg}"
                )
                return {
                    "success": False,
                    "error": f"Fallo en CLI Qwen3-TTS: {err_msg[:600]}",
                    "elapsed_seconds": elapsed,
                }

            if not output_wav.exists() or output_wav.stat().st_size < 1000:
                err_msg = f"El archivo WAV generado no existe o es corrupto: {output_wav}"
                logger.error(f"[Qwen Engine] {err_msg}")
                return {
                    "success": False,
                    "error": err_msg,
                    "elapsed_seconds": elapsed,
                }

            audio_sec = payload.get("audio_seconds", 0.0)
            rtf = payload.get("rtf", 0.0)
            vram = payload.get("peak_vram_gb", 0.0)
            logger.info(
                f"[Qwen Engine] Síntesis completada ✓ | {words_count} palabras -> {audio_sec:.2f}s audio | "
                f"Tiempo: {elapsed}s (RTF: {rtf}x) | VRAM pico: {vram} GB"
            )

            return {
                "success": True,
                "wav_path": str(output_wav),
                "elapsed_seconds": elapsed,
                "audio_seconds": audio_sec,
                "rtf": rtf,
                "words": payload.get("words", words_count),
                "peak_vram_gb": vram,
                "file_size": output_wav.stat().st_size,
            }

        except subprocess.TimeoutExpired:
            logger.error(f"[Qwen Engine] ⏱️ Timeout agotado ({timeout_seconds}s) para bloque de {words_count} palabras.")
            return {
                "success": False,
                "error": f"Tiempo de espera agotado (timeout {timeout_seconds}s) durante la síntesis de Qwen3-TTS ({words_count} palabras)",
                "elapsed_seconds": float(timeout_seconds),
            }
        except Exception as exc:
            logger.exception(f"[Qwen Engine] Excepción no controlada invocando CLI Qwen3-TTS: {exc}")
            return {
                "success": False,
                "error": f"Excepción invocando motor Qwen3-TTS: {exc}",
                "elapsed_seconds": round(time.time() - started, 2),
            }
        finally:
            import shutil

            shutil.rmtree(run_dir, ignore_errors=True)
