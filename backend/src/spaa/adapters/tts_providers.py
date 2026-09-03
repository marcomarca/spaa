from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class TTSGenerationRequest:
    chunk_id: str
    spoken_text: str
    language: str = "es"
    voice: str = "Ryan"
    model: str = "qwen3-tts-1.7b"
    instruct: Optional[str] = None


@dataclass
class TTSGenerationResult:
    success: bool
    wav_path: Optional[Path] = None
    error: Optional[str] = None


class BaseTTSProvider(ABC):
    """Abstract seam for TTS Providers (Gemini AI Studio, F5-TTS, Edge-TTS).

    Decouples book logic from any specific synthesis engine.
    """

    @abstractmethod
    def get_provider_name(self) -> str:
        pass

    @abstractmethod
    async def synthesize(self, request: TTSGenerationRequest, output_wav: Path) -> TTSGenerationResult:
        pass


class GeminiStudioProvider(BaseTTSProvider):
    """Provider for Gemini 2.5 Pro Preview TTS via Chrome MV3 supervised worker."""

    def get_provider_name(self) -> str:
        return "gemini"

    async def synthesize(self, request: TTSGenerationRequest, output_wav: Path) -> TTSGenerationResult:
        # Handled asynchronously via the worker queue and browser extension
        return TTSGenerationResult(
            success=True,
            wav_path=output_wav,
            error=None,
        )


class QwenTTSProvider(BaseTTSProvider):
    """Local provider using Qwen3-TTS 12Hz 1.7B CustomVoice with GPU acceleration and prompt-based style control."""

    def __init__(self) -> None:
        from spaa.adapters.qwen_tts_engine import QwenTTSEngine

        self.engine = QwenTTSEngine()

    def get_provider_name(self) -> str:
        return "qwen"

    async def synthesize(self, request: TTSGenerationRequest, output_wav: Path) -> TTSGenerationResult:
        res = self.engine.synthesize(
            text=request.spoken_text,
            output_wav=output_wav,
            speaker=request.voice if request.voice and request.voice != "Puck" else "Ryan",
            instruct=request.instruct,
        )
        if res.get("success"):
            return TTSGenerationResult(
                success=True,
                wav_path=Path(res["wav_path"]),
                error=None,
            )
        return TTSGenerationResult(
            success=False,
            error=res.get("error", "Error desconocido en inferencia Qwen3-TTS"),
        )


class F5TTSProvider(BaseTTSProvider):
    """Local provider using PyTorch F5-TTS with GPU acceleration and reference voice cloning."""

    def __init__(self) -> None:
        from spaa.adapters.f5_tts_engine import F5TTSEngine

        self.engine = F5TTSEngine()

    def get_provider_name(self) -> str:
        return "f5"

    async def synthesize(self, request: TTSGenerationRequest, output_wav: Path) -> TTSGenerationResult:
        res = self.engine.synthesize(
            text=request.spoken_text,
            output_wav=output_wav,
            voice_name=request.voice if request.voice and request.voice != "Puck" else "marco",
        )
        if res.get("success"):
            return TTSGenerationResult(
                success=True,
                wav_path=Path(res["wav_path"]),
                error=None,
            )
        return TTSGenerationResult(
            success=False,
            error=res.get("error", "Error desconocido en inferencia F5-TTS"),
        )


class EdgeTTSProvider(BaseTTSProvider):
    """Emergency fallback provider using Edge TTS (Stage 2 implementation seam)."""

    def get_provider_name(self) -> str:
        return "edge"

    async def synthesize(self, request: TTSGenerationRequest, output_wav: Path) -> TTSGenerationResult:
        return TTSGenerationResult(
            success=False,
            error="Edge TTS provider no configurado (Etapa 2)",
        )
