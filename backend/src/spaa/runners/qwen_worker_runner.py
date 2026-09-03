from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add backend/src to path if run directly
src_dir = str(Path(__file__).resolve().parents[1])
if src_dir not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from spaa.domain.models import DEFAULT_QWEN_INSTRUCT  # noqa: E402
from spaa.logging_config import setup_worker_logging  # noqa: E402
from spaa.services.local_qwen_worker import LocalQwenWorker  # noqa: E402

log_file_path = setup_worker_logging("qwen_worker")
logger = logging.getLogger("spaa.runner.qwen")


def main() -> None:
    parser = argparse.ArgumentParser(description="SPAA Local Qwen3-TTS Sequential Worker (RTX 3070)")
    parser.add_argument("--worker-id", default="worker-qwen-rtx3070", help="ID del worker")
    parser.add_argument("--alias", default="NVIDIA RTX 3070 Qwen3-TTS", help="Alias del worker")
    parser.add_argument(
        "--speaker",
        default="Ryan",
        help="Speaker para la voz (Ryan, Aiden, Serena, Vivian, Uncle_Fu, Dylan, Eric, Ono_Anna, Sohee)",
    )
    parser.add_argument(
        "--instruct",
        default=DEFAULT_QWEN_INSTRUCT,
        help="Directiva de entonación / prompt de estilo",
    )
    parser.add_argument("--max-temp", type=int, default=70, help="Temperatura máxima GPU (°C) para pausar")
    parser.add_argument("--cooldown-temp", type=int, default=58, help="Temperatura GPU (°C) para reanudar")
    parser.add_argument("--no-thermal", action="store_true", help="Desactivar protector térmico")
    parser.add_argument("--once", action="store_true", help="Procesar solo un trabajo y salir")
    parser.add_argument("--interval", type=float, default=2.0, help="Intervalo de polling en segundos")

    args = parser.parse_args()

    worker = LocalQwenWorker(
        worker_id=args.worker_id,
        profile_alias=args.alias,
        poll_interval_seconds=args.interval,
        speaker=args.speaker,
        instruct=args.instruct,
        max_temp_celsius=args.max_temp,
        cooldown_temp_celsius=args.cooldown_temp,
        check_thermal=not args.no_thermal,
    )

    if args.once:
        logger.info(f"Procesando un único trabajo con {args.worker_id} (Speaker: {args.speaker})...")
        res = worker.process_next_job()
        logger.info(f"Resultado: {res}")
    else:
        logger.info(f"Iniciando worker continuo Qwen3-TTS ({args.worker_id} - {args.alias})...")
        logger.info(f"Speaker por defecto: {args.speaker}")
        logger.info(f"Instruct activo: {args.instruct[:80]}...")
        logger.info(f"Archivo de log activo: {log_file_path}")
        try:
            asyncio.run(worker.run_loop())
        except KeyboardInterrupt:
            logger.info("Worker Qwen3-TTS detenido por el usuario.")


if __name__ == "__main__":
    main()
