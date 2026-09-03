from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

# Add backend/src to path
repo_root = Path(__file__).resolve().parents[1]
backend_src = repo_root / "backend" / "src"
if str(backend_src) not in sys.path:
    sys.path.insert(0, str(backend_src))

from spaa.adapters.database import Base, engine, SessionLocal  # noqa: E402
from spaa.adapters.db_models import (  # noqa: E402
    BookModel,
    ChapterModel,
    TtsChunkModel,
    TtsJobModel,
)
from spaa.services.book_service import BookService  # noqa: E402


def reset_and_import() -> None:
    print("================================================================")
    print("  SPAA - Reinicio Limpio de Base de Datos y Reimportación       ")
    print("================================================================")

    data_dir = repo_root / "data"
    book_path = data_dir / "3-decisiones-que-toman-las-personas-exitosas_es.md"
    if not book_path.exists():
        print(f"[ERROR] No se encuentra el archivo del libro en: {book_path}")
        sys.exit(1)

    print("\n1. Limpiando archivos temporales antiguos de síntesis...")
    for temp_subdir in ["temporary", "f5_work", "qwen_work"]:
        target_dir = data_dir / temp_subdir
        if target_dir.exists():
            for item in target_dir.glob("*"):
                if item.is_file():
                    item.unlink(missing_ok=True)
                elif item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
            print(f"   ✓ Directorio limpio: {target_dir}")

    # Limpiar biblioteca de audio previa si existiese
    library_dir = data_dir / "library"
    if library_dir.exists():
        for item in library_dir.glob("*"):
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
        print(f"   ✓ Biblioteca reiniciada: {library_dir}")

    print("\n2. Recreando esquema de base de datos SQLite con soporte para Qwen...")
    # Cerrar conexiones activas y re-crear tablas
    db_file = data_dir / "spaa_master.sqlite"
    engine.dispose()
    if db_file.exists():
        # Crear copia de respaldo por seguridad
        backup_file = data_dir / "backups" / "spaa_master_pre_qwen.sqlite"
        backup_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(db_file, backup_file)
        print(f"   ✓ Respaldo previo guardado en: {backup_file}")
        db_file.unlink()
        print("   ✓ Base de datos anterior eliminada.")

    Base.metadata.create_all(bind=engine)
    print("   ✓ Esquema relacional recreado exitosamente con tabla tts_chunks.instruct.")

    print("\n3. Importando libro '3 decisiones que toman las personas exitosas'...")
    with open(book_path, "r", encoding="utf-8") as f:
        markdown_text = f.read()

    db = SessionLocal()
    try:
        service = BookService(db)
        book = service.import_book_from_markdown(
            title="3 decisiones que toman las personas exitosas",
            author="John C. Maxwell",
            markdown_text=markdown_text,
            language="es",
            mode="local",
            filename=book_path.name,
        )

        total_chapters = db.query(ChapterModel).filter_by(book_id=book.id).count()
        total_chunks = db.query(TtsChunkModel).filter_by(book_id=book.id).count()
        total_jobs = db.query(TtsJobModel).count()
        qwen_jobs = db.query(TtsJobModel).filter_by(provider="qwen").count()

        print("\n================================================================")
        print("  IMPORTACIÓN EXITOSA DESDE CERO                                ")
        print("================================================================")
        print(f"  ID Libro:      {book.id}")
        print(f"  Título:        {book.title}")
        print(f"  Autor:         {book.author}")
        print(f"  Capítulos:     {total_chapters}")
        print(f"  Bloques TTS:   {total_chunks} (todos configurados para Qwen3-TTS)")
        print(f"  Trabajos Cola: {total_jobs} (Proveedor Qwen: {qwen_jobs})")
        print("================================================================\n")

    finally:
        db.close()


if __name__ == "__main__":
    reset_and_import()
