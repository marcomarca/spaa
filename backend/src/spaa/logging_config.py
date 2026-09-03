from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def setup_worker_logging(
    log_name: str = "qwen_worker",
    log_dir: Path | None = None,
    log_level: int = logging.INFO,
    max_bytes: int = 10 * 1024 * 1024,  # 10 MB
    backup_count: int = 5,
) -> Path:
    """
    Configura el sistema de logging para workers locales de SPAA con salida simultánea
    a consola y archivo rotativo persistente en data/logs/.
    """
    if log_dir is None:
        # data/logs relative to backend directory or project root
        repo_root = Path(__file__).resolve().parents[3]
        log_dir = repo_root / "data" / "logs"

    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{log_name}.log"

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s:%(lineno)d] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Evitar duplicación de handlers si ya fue configurado
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    # Handler para consola
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Handler rotativo de archivo
    file_handler = RotatingFileHandler(
        filename=str(log_file),
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    logging.getLogger("spaa").info(f"Sistema de logging inicializado. Archivo activo: {log_file}")
    return log_file
