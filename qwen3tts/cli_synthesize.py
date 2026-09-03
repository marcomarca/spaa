from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Ensure this directory is in Python path so qwen_custom_voice and qwen_tts are found
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from qwen_custom_voice import (  # noqa: E402
    DEFAULT_ENERGY_INSTRUCT,
    DEFAULT_MAX_NEW_TOKENS,
    SPEAKERS,
    QwenCustomVoiceEngine,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CLI de síntesis Qwen3-TTS 12Hz 1.7B CustomVoice")
    parser.add_argument("--text", type=str, default="", help="Texto a sintetizar")
    parser.add_argument("--text_file", type=str, default=None, help="Archivo con texto a sintetizar")
    parser.add_argument("--output", type=str, required=True, help="Ruta del archivo WAV de salida")
    parser.add_argument(
        "--speaker",
        type=str,
        default="Ryan",
        choices=list(SPEAKERS.keys()),
        help="Speaker para la voz",
    )
    parser.add_argument(
        "--instruct",
        type=str,
        default=DEFAULT_ENERGY_INSTRUCT,
        help="Directiva de entonación o estilo para CustomVoice",
    )
    parser.add_argument(
        "--instruct_file",
        type=str,
        default=None,
        help="Archivo con instruct/estilo",
    )
    parser.add_argument(
        "--chunk_words",
        type=int,
        default=90,
        help="Palabras máximas por bloque secuencial (recomendado: 90 para evitar saturación)",
    )
    parser.add_argument(
        "--gap",
        type=float,
        default=0.20,
        help="Segundos de silencio entre bloques",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=-1,
        help="Semilla aleatoria (-1 para aleatorio)",
    )
    parser.add_argument(
        "--max_new_tokens",
        type=int,
        default=DEFAULT_MAX_NEW_TOKENS,
        help="Tokens máximos por llamada a generate_custom_voice",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # Determine input text
    text = args.text
    if args.text_file:
        tf_path = Path(args.text_file)
        if tf_path.exists():
            text = tf_path.read_text(encoding="utf-8")
        else:
            print(json.dumps({"success": False, "error": f"Archivo de texto no encontrado: {args.text_file}"}))
            sys.exit(1)

    text = text.strip()
    if not text:
        print(json.dumps({"success": False, "error": "El texto a sintetizar está vacío."}))
        sys.exit(1)

    # Determine instruct
    instruct = args.instruct
    if args.instruct_file:
        inf_path = Path(args.instruct_file)
        if inf_path.exists():
            instruct = inf_path.read_text(encoding="utf-8")

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    engine = QwenCustomVoiceEngine()
    if not engine.model_is_downloaded():
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Modelo no disponible en {engine.MODEL_DIR if hasattr(engine, 'MODEL_DIR') else 'models'}. Comprueba los pesos.",
                }
            )
        )
        sys.exit(1)

    def on_progress(current_idx: int, total_chunks: int, msg: str) -> None:
        print(f"[PROGRESS] {msg}", flush=True)

    try:
        stats = engine.generate(
            text=text,
            speaker=args.speaker,
            instruct=instruct,
            seed=args.seed,
            max_new_tokens=args.max_new_tokens,
            chunk_words=args.chunk_words,
            gap_seconds=args.gap,
            progress_callback=on_progress,
        )


        # Move generated file if output_path is different from stats.output_path
        gen_path = Path(stats.output_path)
        if gen_path != output_path:
            import shutil

            shutil.copy2(gen_path, output_path)

        result_payload = {
            "success": True,
            "wav_path": str(output_path),
            "words": stats.words,
            "chunks": stats.chunks,
            "audio_seconds": round(stats.audio_seconds, 2),
            "generation_seconds": round(stats.generation_seconds, 2),
            "rtf": round(stats.rtf, 2),
            "sample_rate": stats.sample_rate,
            "peak_vram_gb": round(stats.peak_vram_gb, 2),
        }
        print(json.dumps(result_payload, ensure_ascii=False))
        sys.exit(0)

    except Exception as exc:
        err_msg = f"{type(exc).__name__}: {exc}"
        print(json.dumps({"success": False, "error": err_msg}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
