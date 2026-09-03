from __future__ import annotations

import gc
import json
import os
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch

# Keep Hugging Face / Transformers cache inside this standalone folder.
ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "cache" / "huggingface"
MODEL_DIR = ROOT / "models" / "Qwen3-TTS-12Hz-1.7B-CustomVoice"
OUTPUT_DIR = ROOT / "outputs"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HF_HOME", str(CACHE_DIR))
os.environ.setdefault("HF_HUB_CACHE", str(CACHE_DIR / "hub"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
LANGUAGE = "Spanish"
DEFAULT_MAX_NEW_TOKENS = 2048

SPEAKERS = {
    "Ryan": {
        "description": "Voz masculina dinámica, con fuerte impulso rítmico.",
        "native": "Inglés",
    },
    "Aiden": {
        "description": "Voz masculina estadounidense luminosa, con rango medio claro.",
        "native": "Inglés",
    },
    "Vivian": {
        "description": "Voz femenina joven, brillante y ligeramente incisiva.",
        "native": "Chino",
    },
    "Serena": {
        "description": "Voz femenina joven, cálida y suave.",
        "native": "Chino",
    },
    "Uncle_Fu": {
        "description": "Voz masculina madura, grave y de timbre meloso.",
        "native": "Chino",
    },
    "Dylan": {
        "description": "Voz masculina joven de Pekín, clara y natural.",
        "native": "Chino (dialecto de Pekín)",
    },
    "Eric": {
        "description": "Voz masculina vivaz de Chengdu, brillante y ligeramente ronca.",
        "native": "Chino (dialecto de Sichuan)",
    },
    "Ono_Anna": {
        "description": "Voz femenina japonesa juguetona, ligera y ágil.",
        "native": "Japonés",
    },
    "Sohee": {
        "description": "Voz femenina coreana cálida y emocional.",
        "native": "Coreano",
    },
}

DEFAULT_ENERGY_INSTRUCT = (
    "Extremely energetic, enthusiastic and dynamic delivery. Fast but clear pace, "
    "strong emphasis on key words, lively natural intonation, expressive and powerful "
    "from beginning to end."
)


def set_seed(seed: int) -> int:
    """Mirror the deterministic seed handling used by Ultimate TTS Studio."""
    if seed == -1:
        seed = random.randint(0, 2_147_483_647)
    seed = int(seed)
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    return seed


def split_text_by_words(text: str, max_words: int = 90) -> list[str]:
    """
    External wrapper for long text. The CustomVoice model itself receives one chunk at a time.
    Splits on sentence boundaries first, then words if a sentence is too long.
    """
    text = re.sub(r"\s+", " ", text.strip())
    if not text:
        return []

    sentences = re.split(r"(?<=[.!?…])\s+", text)
    chunks: list[str] = []
    current: list[str] = []
    current_count = 0

    def flush() -> None:
        nonlocal current, current_count
        if current:
            chunks.append(" ".join(current).strip())
            current = []
            current_count = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        words = sentence.split()

        if len(words) > max_words:
            flush()
            for i in range(0, len(words), max_words):
                chunks.append(" ".join(words[i:i + max_words]))
            continue

        if current_count + len(words) <= max_words:
            current.append(sentence)
            current_count += len(words)
        else:
            flush()
            current.append(sentence)
            current_count = len(words)

    flush()
    return chunks


@dataclass
class GenerationStats:
    output_path: str
    words: int
    chunks: int
    audio_seconds: float
    generation_seconds: float
    seed: int
    sample_rate: int
    peak_vram_gb: float

    @property
    def rtf(self) -> float:
        return self.generation_seconds / self.audio_seconds if self.audio_seconds else 0.0

    def as_text(self) -> str:
        return (
            f"Archivo: {self.output_path}\n"
            f"Palabras: {self.words} | Bloques: {self.chunks} | Seed: {self.seed}\n"
            f"Audio: {self.audio_seconds:.2f} s | Generación: {self.generation_seconds:.2f} s | "
            f"RTF: {self.rtf:.2f}x\n"
            f"Sample rate: {self.sample_rate} Hz | VRAM pico: {self.peak_vram_gb:.2f} GB"
        )


class QwenCustomVoiceEngine:
    """Standalone engine restricted to Qwen3-TTS 12Hz 1.7B CustomVoice."""

    def __init__(self) -> None:
        self.tts = None
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.attention_backend = "not loaded"

    def model_is_downloaded(self) -> bool:
        return (MODEL_DIR / "config.json").exists()

    def _flash_attn_available(self) -> bool:
        try:
            import flash_attn  # noqa: F401
            return True
        except Exception:
            return False

    def load(self) -> str:
        if self.tts is not None:
            return self.status()
        if not torch.cuda.is_available():
            raise RuntimeError(
                "CUDA no está disponible. Esta edición está preparada para NVIDIA/CUDA. "
                "Comprueba la instalación de PyTorch CUDA."
            )
        if not self.model_is_downloaded():
            raise FileNotFoundError(
                f"No encuentro el modelo en {MODEL_DIR}. Ejecuta DOWNLOAD_MODEL.bat primero."
            )

        from qwen_tts import Qwen3TTSModel

        kwargs = {
            "device_map": self.device,
            "torch_dtype": torch.bfloat16,
        }
        # Usar SDPA (PyTorch native scaled dot-product attention) rápido, seguro y estable en Windows
        kwargs["attn_implementation"] = "sdpa"
        self.attention_backend = "sdpa"

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()

        self.tts = Qwen3TTSModel.from_pretrained(str(MODEL_DIR), **kwargs)
        return self.status()

    def unload(self) -> str:
        if self.tts is not None:
            del self.tts
            self.tts = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        self.attention_backend = "not loaded"
        return "Modelo descargado de VRAM."

    def status(self) -> str:
        gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
        allocated = torch.cuda.memory_allocated(0) / (1024**3) if torch.cuda.is_available() else 0
        reserved = torch.cuda.memory_reserved(0) / (1024**3) if torch.cuda.is_available() else 0
        return (
            f"Modelo: {MODEL_ID}\n"
            f"Ruta local: {MODEL_DIR}\n"
            f"Estado: {'CARGADO' if self.tts is not None else 'NO CARGADO'}\n"
            f"Dispositivo: {gpu}\n"
            f"Atención: {self.attention_backend}\n"
            f"VRAM actual: {allocated:.2f} GB asignados / {reserved:.2f} GB reservados"
        )

    def generate(
        self,
        text: str,
        speaker: str = "Ryan",
        instruct: str = "",
        seed: int = -1,
        max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS,
        chunk_words: int = 90,
        gap_seconds: float = 0.20,
        progress_callback=None,
    ) -> GenerationStats:
        if self.tts is None:
            self.load()

        text = text.strip()
        if not text:
            raise ValueError("El texto está vacío.")
        if speaker not in SPEAKERS:
            raise ValueError(f"Speaker no válido: {speaker}")

        seed = set_seed(seed)
        chunks = split_text_by_words(text, max_words=max(1, int(chunk_words)))
        if not chunks:
            raise ValueError("No se pudo crear ningún bloque de texto.")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_speaker = speaker.lower().replace(" ", "_")
        output_path = OUTPUT_DIR / f"qwen3_customvoice_es_{safe_speaker}_{timestamp}.wav"
        manifest_path = output_path.with_suffix(".json")

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.synchronize()

        started = time.perf_counter()
        total_audio_samples = 0
        sr: Optional[int] = None
        writer = None
        chunk_records = []

        try:
            for idx, chunk in enumerate(chunks, start=1):
                if progress_callback:
                    progress_callback(
                        idx,
                        len(chunks),
                        f"Iniciando micro-pasada {idx}/{len(chunks)} ({len(chunk.split())} palabras)...",
                    )

                if torch.cuda.is_available():
                    torch.cuda.synchronize()
                chunk_started = time.perf_counter()

                wavs, current_sr = self.tts.generate_custom_voice(
                    text=chunk,
                    language=LANGUAGE,
                    speaker=speaker.lower().replace(" ", "_"),
                    instruct=instruct.strip() if instruct.strip() else None,
                    non_streaming_mode=True,
                    max_new_tokens=int(max_new_tokens),
                )

                if torch.cuda.is_available():
                    torch.cuda.synchronize()
                chunk_elapsed = time.perf_counter() - chunk_started

                wav = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
                current_sr = int(current_sr)

                if progress_callback:
                    chunk_dur = len(wav) / current_sr
                    rtf_chunk = chunk_elapsed / chunk_dur if chunk_dur > 0 else 0.0
                    progress_callback(
                        idx,
                        len(chunks),
                        f"Micro-pasada {idx}/{len(chunks)} lista: {chunk_dur:.1f}s audio en {chunk_elapsed:.1f}s (RTF {rtf_chunk:.1f}x) ✓",
                    )

                if sr is None:
                    sr = current_sr
                    writer = sf.SoundFile(
                        str(output_path),
                        mode="w",
                        samplerate=sr,
                        channels=1,
                        subtype="PCM_16",
                        format="WAV",
                    )
                elif current_sr != sr:
                    raise RuntimeError(f"Sample rate cambió entre bloques: {sr} -> {current_sr}")

                writer.write(wav)
                total_audio_samples += len(wav)

                if idx < len(chunks) and gap_seconds > 0:
                    silence = np.zeros(int(sr * float(gap_seconds)), dtype=np.float32)
                    writer.write(silence)
                    total_audio_samples += len(silence)

                chunk_records.append(
                    {
                        "index": idx,
                        "words": len(chunk.split()),
                        "chars": len(chunk),
                        "audio_seconds": len(wav) / sr,
                        "generation_seconds": chunk_elapsed,
                        "text": chunk,
                    }
                )

            if progress_callback:
                progress_callback(len(chunks), len(chunks), "Finalizando WAV")
        finally:
            if writer is not None:
                writer.close()

        generation_seconds = time.perf_counter() - started
        if sr is None:
            raise RuntimeError("No se generó audio.")

        audio_seconds = total_audio_samples / sr
        peak_vram = (
            torch.cuda.max_memory_allocated(0) / (1024**3) if torch.cuda.is_available() else 0.0
        )

        stats = GenerationStats(
            output_path=str(output_path),
            words=len(text.split()),
            chunks=len(chunks),
            audio_seconds=audio_seconds,
            generation_seconds=generation_seconds,
            seed=seed,
            sample_rate=sr,
            peak_vram_gb=peak_vram,
        )

        manifest = {
            "model": MODEL_ID,
            "language": LANGUAGE,
            "speaker": speaker,
            "instruct": instruct,
            "seed": seed,
            "max_new_tokens": int(max_new_tokens),
            "chunk_words": int(chunk_words),
            "gap_seconds": float(gap_seconds),
            "stats": {
                "words": stats.words,
                "chunks": stats.chunks,
                "audio_seconds": stats.audio_seconds,
                "generation_seconds": stats.generation_seconds,
                "rtf": stats.rtf,
                "sample_rate": stats.sample_rate,
                "peak_vram_gb": stats.peak_vram_gb,
            },
            "chunks_detail": chunk_records,
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

        return stats
