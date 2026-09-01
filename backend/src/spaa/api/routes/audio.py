from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from spaa.adapters.database import get_db
from spaa.adapters.db_models import ChapterModel
from spaa.adapters.repositories import ChapterRepository

router = APIRouter(prefix="/api/audio", tags=["Audio & Offline Downloads"])


@router.get("/chapter/{chapter_id}")
def stream_chapter_audio(chapter_id: str, db: Session = Depends(get_db)):
    repo = ChapterRepository(db)
    chapter = repo.get(chapter_id)
    if not chapter or not chapter.audio_path:
        raise HTTPException(status_code=404, detail="Audio de capítulo no encontrado o no generado")

    audio_file = Path(chapter.audio_path)
    if not audio_file.exists():
        raise HTTPException(status_code=404, detail="Archivo físico de audio no encontrado")

    headers = {
        "X-Audio-SHA256": chapter.audio_sha256 or "",
        "X-Chapter-Sequence": str(chapter.sequence),
        "X-Duration-Seconds": str(chapter.duration_seconds),
        "Accept-Ranges": "bytes",
    }

    return FileResponse(
        path=str(audio_file),
        media_type="audio/mpeg",
        filename=f"chapter_{chapter.sequence:03d}.mp3",
        headers=headers,
    )


@router.get("/offline-manifest")
def get_offline_manifest(db: Session = Depends(get_db)) -> Dict[str, Any]:
    stmt = (
        select(ChapterModel)
        .where(ChapterModel.is_ready)
        .order_by(ChapterModel.sequence.asc())
    )
    ready_chapters = list(db.scalars(stmt).all())

    manifest_items: List[Dict[str, Any]] = []
    total_duration_seconds = 0.0

    for chap in ready_chapters:
        file_size = 0
        if chap.audio_path and Path(chap.audio_path).exists():
            file_size = Path(chap.audio_path).stat().st_size

        total_duration_seconds += chap.duration_seconds

        manifest_items.append(
            {
                "chapter_id": chap.id,
                "book_id": chap.book_id,
                "sequence": chap.sequence,
                "title": chap.title,
                "duration_seconds": chap.duration_seconds,
                "file_size_bytes": file_size,
                "sha256": chap.audio_sha256,
                "download_url": f"/api/audio/chapter/{chap.id}",
            }
        )

    return {
        "total_chapters": len(manifest_items),
        "total_duration_hours": round(total_duration_seconds / 3600.0, 2),
        "chapters": manifest_items,
    }
