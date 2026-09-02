from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add src to path
src_dir = str(Path(__file__).resolve().parents[1])
if src_dir not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from spaa.services.local_f5_worker import LocalF5Worker  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)


def main() -> None:
    parser = argparse.ArgumentParser(description="SPAA Local F5-TTS Sequential Worker")
    parser.add_argument("--worker-id", default="worker-f5-rtx3070", help="ID del worker")
    parser.add_argument("--alias", default="NVIDIA RTX 3070 F5-TTS", help="Alias del worker")
    parser.add_argument("--once", action="store_true", help="Procesar solo un trabajo y salir")
    parser.add_argument("--interval", type=float, default=2.0, help="Intervalo de polling en segundos")

    args = parser.parse_args()

    worker = LocalF5Worker(
        worker_id=args.worker_id,
        profile_alias=args.alias,
        poll_interval_seconds=args.interval,
    )

    if args.once:
        print(f"Procesando un único trabajo con {args.worker_id}...")
        res = worker.process_next_job()
        print("Resultado:", res)
    else:
        print(f"Iniciando worker continuo F5-TTS ({args.worker_id} - {args.alias})...")
        try:
            asyncio.run(worker.run_loop())
        except KeyboardInterrupt:
            print("Worker detenido por el usuario.")


if __name__ == "__main__":
    main()
