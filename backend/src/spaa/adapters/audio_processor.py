import json
import logging
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List

from spaa.config import settings

logger = logging.getLogger(__name__)


@dataclass
class AudioProbeResult:
    duration_seconds: float
    channels: int
    sample_rate: int
    bitrate: int
    is_silent: bool = False
    error: str | None = None


class FFmpegAudioProcessor:
    """Adapter for audio analysis, validation, and encoding via FFmpeg."""

    def __init__(self):
        self.bitrate = f"{settings.mp3_bitrate_kbps}k"
        self.sample_rate = settings.mp3_sample_rate_hz
        self.channels = settings.mp3_channels

    def probe(self, audio_path: Path) -> AudioProbeResult:
        if not audio_path.exists():
            return AudioProbeResult(0.0, 0, 0, 0, error=f"Archivo no encontrado: {audio_path}")

        try:
            # Use ffprobe to extract format and stream metadata as JSON
            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration,bit_rate:stream=channels,sample_rate",
                "-of",
                "json",
                str(audio_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)

            format_info = data.get("format", {})
            duration = float(format_info.get("duration", 0.0))
            bitrate = int(format_info.get("bit_rate", 0))

            streams = data.get("streams", [])
            channels = int(streams[0].get("channels", 1)) if streams else 1
            sample_rate = int(streams[0].get("sample_rate", 44100)) if streams else 44100

            # Quick silence check using silencedetect filter if audio is non-trivial
            is_silent = False
            if duration > 1.0:
                silence_cmd = [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-i",
                    str(audio_path),
                    "-af",
                    "silencedetect=noise=-50dB:d=0.5",
                    "-f",
                    "null",
                    "-",
                ]
                silence_res = subprocess.run(silence_cmd, capture_output=True, text=True)
                # If silence_start=0 and silence_duration is >= 95% of duration, it's silent
                if (
                    "silence_start: 0" in silence_res.stderr
                    and f"silence_duration: {duration:.1f}" in silence_res.stderr
                ):
                    is_silent = True

            return AudioProbeResult(
                duration_seconds=duration,
                channels=channels,
                sample_rate=sample_rate,
                bitrate=bitrate,
                is_silent=is_silent,
            )
        except Exception as e:
            logger.warning(f"Error al analizar audio {audio_path}: {e}")
            return AudioProbeResult(0.0, 0, 0, 0, error=str(e))

    def concatenate_wavs_to_mp3(self, wav_paths: List[Path], output_mp3: Path) -> Path:
        """Concatenates a sequence of WAV chunks, normalizes, and encodes to chapter MP3."""
        if not wav_paths:
            raise ValueError("No se proporcionaron archivos WAV para concatenar.")

        output_mp3.parent.mkdir(parents=True, exist_ok=True)
        temp_output = output_mp3.with_suffix(".tmp.mp3")

        # Create temporary concat demuxer text file
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt", encoding="utf-8") as f:
            concat_list_path = Path(f.name)
            for path in wav_paths:
                clean_path = str(path.resolve()).replace("\\", "/")
                f.write(f"file '{clean_path}'\n")

        try:
            cmd = [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list_path),
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ac",
                str(self.channels),
                "-ar",
                str(self.sample_rate),
                "-b:a",
                self.bitrate,
                str(temp_output),
            ]
            subprocess.run(cmd, capture_output=True, text=True, check=True)

            if output_mp3.exists():
                output_mp3.unlink()
            temp_output.rename(output_mp3)

            return output_mp3
        except subprocess.CalledProcessError as e:
            if temp_output.exists():
                temp_output.unlink()
            raise RuntimeError(f"Fallo al codificar MP3 con FFmpeg: {e.stderr}") from e
        finally:
            if concat_list_path.exists():
                concat_list_path.unlink()
