from dataclasses import dataclass
from pathlib import Path


@dataclass
class QAResult:
    passed: bool
    reason: str | None = None
    duration_seconds: float = 0.0
    file_size_bytes: int = 0
    words_per_minute: float = 0.0


class AudioQARules:
    """Deterministic basic QA rules for synthesized audio (WAV / MP3)."""

    MIN_FILE_SIZE_BYTES = 2048  # Minimum viable audio header + payload
    MIN_DURATION_SECONDS = 0.5
    MIN_EXPECTED_WPM = 50.0  # Slowest realistic speech
    MAX_EXPECTED_WPM = 350.0  # Fastest intelligible speech

    @classmethod
    def evaluate_chunk_audio(
        cls,
        audio_path: Path,
        word_count: int,
        duration_seconds: float,
        is_silent: bool = False,
    ) -> QAResult:
        if not audio_path.exists():
            return QAResult(passed=False, reason=f"Archivo de audio no existe: {audio_path.name}")

        size = audio_path.stat().st_size
        if size < cls.MIN_FILE_SIZE_BYTES:
            return QAResult(
                passed=False,
                reason=f"Archivo demasiado pequeño ({size} bytes)",
                file_size_bytes=size,
            )

        if duration_seconds < cls.MIN_DURATION_SECONDS:
            return QAResult(
                passed=False,
                reason=f"Duración inválida ({duration_seconds:.2f} s)",
                duration_seconds=duration_seconds,
                file_size_bytes=size,
            )

        if is_silent:
            return QAResult(
                passed=False,
                reason="El archivo contiene únicamente silencio",
                duration_seconds=duration_seconds,
                file_size_bytes=size,
            )

        wpm = 0.0
        if duration_seconds > 0 and word_count > 0:
            wpm = (word_count / duration_seconds) * 60.0
            # If word count is substantial, verify speech pace plausibility
            if word_count > 20 and (wpm < cls.MIN_EXPECTED_WPM or wpm > cls.MAX_EXPECTED_WPM):
                return QAResult(
                    passed=False,
                    reason=f"Velocidad de habla anómala ({wpm:.1f} palabras/minuto para {word_count} palabras en {duration_seconds:.1f} s)",
                    duration_seconds=duration_seconds,
                    file_size_bytes=size,
                    words_per_minute=wpm,
                )

        return QAResult(
            passed=True,
            duration_seconds=duration_seconds,
            file_size_bytes=size,
            words_per_minute=wpm,
        )
