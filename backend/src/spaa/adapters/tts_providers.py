from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class TTSGenerationRequest:
    chunk_id: str
    spoken_text: str
    language: str = "es"
    voice: str = "Puck"
    model: str = "gemini-2.5-pro-preview-tts"


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


class F5TTSProvider(BaseTTSProvider):
    """Local fallback provider using PyTorch F5-TTS (Stage 2 implementation seam)."""

    def get_provider_name(self) -> str:
        return "f5"

    async def synthesize(self, request: TTSGenerationRequest, output_wav: Path) -> TTSGenerationResult:
        # Seam ready for local F5-TTS model weights and 15s reference voice sample
        return TTSGenerationResult(
            success=False,
            error="F5-TTS local provider no configurado (Etapa 2)",
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
