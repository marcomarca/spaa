from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


class F5TTSEngine:
    """Motor de inferencia local para F5-TTS en español con aceleración GPU (CUDA)."""

    def __init__(
        self,
        base_dir: Path | None = None,
        model_name: str = "f5_spanish",
        default_voice: str = "marco",
        speed: float = 1.0,
    ) -> None:
        self.base_dir = (base_dir or Path(__file__).resolve().parents[4]).resolve()
        self.data_dir = self.base_dir / "data"
        self.models_dir = self.data_dir / "models" / model_name
        self.voices_dir = self.data_dir / "voices"
        self.work_dir = self.data_dir / "f5_work"
        self.default_voice = default_voice
        self.speed = speed

        self.ckpt_path = self.models_dir / "model_1250000.safetensors"
        self.vocab_path = self.models_dir / "vocab.txt"

        # Dedicated Python environment for F5
        f5_venv_py = self.base_dir / "backend" / ".venv-f5" / "Scripts" / "python.exe"
        if f5_venv_py.exists():
            self.python_exe = str(f5_venv_py)
        else:
            self.python_exe = sys.executable

    def is_model_available(self) -> bool:
        """Verifica si el checkpoint y vocabulario de F5 existen localmente."""
        return self.ckpt_path.exists() and self.vocab_path.exists()

    def get_voice_assets(self, voice_name: str | None = None) -> tuple[Path, str]:
        """Obtiene la ruta al WAV de referencia y su transcripción."""
        voice = voice_name or self.default_voice
        voice_folder = self.voices_dir / voice

        ref_wav = voice_folder / "reference.wav"
        if not ref_wav.exists():
            # Fallback a marco
            ref_wav = self.voices_dir / "marco" / "reference.wav"

        voice_json = voice_folder / "voice.json"
        ref_text = (
            "He descubierto que frecuentemente a la gente se le hace difícil definir el éxito. "
            "Pero si no sabe lo que es el éxito, ¿cómo va a alcanzarlo? "
            "Por eso quiero ayudarle a identificar una definición de éxito que le ayude"
        )

        if voice_json.exists():
            try:
                data = json.loads(voice_json.read_text(encoding="utf-8"))
                refs = data.get("references", [])
                if refs and refs[0].get("transcript"):
                    ref_text = refs[0]["transcript"]
            except Exception:
                pass

        if not ref_wav.exists():
            raise FileNotFoundError(f"Audio de referencia no encontrado para la voz: {voice}")

        return ref_wav, ref_text

    def _find_generated_wav(self, run_dir: Path, start_time: float) -> Path:
        """Localiza el archivo WAV más reciente emitido por la CLI de F5."""
        wavs: list[Path] = []
        for p in run_dir.rglob("*.wav"):
            try:
                if p.stat().st_mtime >= start_time - 3 and p.stat().st_size > 1000:
                    wavs.append(p)
            except FileNotFoundError:
                pass
        if not wavs:
            raise FileNotFoundError(f"F5 terminó pero no se encontró el WAV generado en: {run_dir}")
        return sorted(wavs, key=lambda x: (x.stat().st_mtime, x.stat().st_size), reverse=True)[0]

    def synthesize(
        self,
        text: str,
        output_wav: Path,
        voice_name: str | None = None,
        speed: float | None = None,
    ) -> dict[str, Any]:
        """Sintetiza un bloque de texto en audio WAV usando F5-TTS."""
        if not self.is_model_available():
            raise FileNotFoundError(
                f"Archivos de modelo F5 no encontrados en {self.models_dir}. Se requiere {self.ckpt_path.name}"
            )

        ref_wav, ref_text = self.get_voice_assets(voice_name)
        current_speed = speed if speed is not None else self.speed

        output_wav = Path(output_wav).resolve()
        output_wav.parent.mkdir(parents=True, exist_ok=True)

        session_id = f"synth_{int(time.time() * 1000)}"
        run_dir = self.work_dir / session_id
        run_dir.mkdir(parents=True, exist_ok=True)

        gen_txt_file = run_dir / "prompt.txt"
        gen_txt_file.write_text(text.strip() + " ", encoding="utf-8")

        cmd = [
            self.python_exe,
            "-m",
            "f5_tts.infer.infer_cli",
            "--ckpt_file",
            str(self.ckpt_path),
            "--vocab_file",
            str(self.vocab_path),
            "--ref_audio",
            str(ref_wav),
            "--ref_text",
            ref_text,
            "--gen_file",
            str(gen_txt_file),
            "--output_dir",
            str(run_dir),
            "--vocoder_name",
            "vocos",
            "--speed",
            str(current_speed),
        ]

        start_time = time.time()
        result = subprocess.run(
            cmd,
            cwd=str(self.base_dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        elapsed = time.time() - start_time

        if result.returncode != 0:
            error_msg = result.stderr.strip() or result.stdout.strip() or f"F5 devolvió código {result.returncode}"
            shutil.rmtree(run_dir, ignore_errors=True)
            return {
                "success": False,
                "error": error_msg[:1000],
                "elapsed_seconds": round(elapsed, 2),
            }

        try:
            generated_wav = self._find_generated_wav(run_dir, start_time)
            shutil.copy2(generated_wav, output_wav)
            shutil.rmtree(run_dir, ignore_errors=True)
            return {
                "success": True,
                "wav_path": str(output_wav),
                "elapsed_seconds": round(elapsed, 2),
                "file_size": output_wav.stat().st_size,
            }
        except Exception as exc:
            shutil.rmtree(run_dir, ignore_errors=True)
            return {
                "success": False,
                "error": f"Fallo al recuperar audio WAV generado: {exc}",
                "elapsed_seconds": round(elapsed, 2),
            }
