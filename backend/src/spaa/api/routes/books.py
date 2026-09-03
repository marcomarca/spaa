from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from spaa.adapters.database import get_db
from spaa.adapters.repositories import BookRepository
from spaa.services.book_service import BookService

router = APIRouter(prefix="/api/books", tags=["Books"])


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    author: str
    mode: str
    created_at: str


class ReadyChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sequence: int
    duration_seconds: float
    word_count: int
    spoken_text: str = ""


class ChapterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sequence: int
    title: str
    word_count: int
    duration_seconds: float
    is_ready: bool
    audio_sha256: Optional[str] = None
    total_chunks: int = 0
    ready_chunks_count: int = 0
    generating_chunks_count: int = 0
    ready_duration_seconds: float = 0.0
    ready_chunks: List[ReadyChunkResponse] = []


class BookDetailResponse(BookResponse):
    chapters: List[ChapterResponse] = []


class ImportMarkdownRequest(BaseModel):
    title: str
    author: str = ""
    markdown_text: str
    language: str = "es"
    mode: str = "auto"


@router.get("", response_model=List[BookResponse])
def list_books(db: Session = Depends(get_db)):
    repo = BookRepository(db)
    books = repo.list_all()
    return [
        BookResponse(
            id=b.id,
            title=b.title,
            author=b.author,
            mode=b.mode,
            created_at=b.created_at.isoformat(),
        )
        for b in books
    ]


@router.get("/{book_id}", response_model=BookDetailResponse)
def get_book(book_id: str, db: Session = Depends(get_db)):
    repo = BookRepository(db)
    book = repo.get(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Libro no encontrado")

    chapters: List[ChapterResponse] = []
    for c in sorted(book.chapters, key=lambda x: x.sequence):
        c_chunks = getattr(c, "chunks", [])
        total_chunks = len(c_chunks)
        ready_chunks_list = [
            ReadyChunkResponse(
                id=ch.id,
                sequence=ch.sequence,
                duration_seconds=ch.duration_seconds,
                word_count=ch.word_count,
                spoken_text=ch.spoken_text[:120] if ch.spoken_text else "",
            )
            for ch in sorted(c_chunks, key=lambda x: x.sequence)
            if ch.status == "READY" and ch.duration_seconds > 0
        ]
        ready_count = len(ready_chunks_list)
        generating_count = sum(1 for ch in c_chunks if ch.status == "GENERATING")
        ready_duration = sum(ch.duration_seconds for ch in ready_chunks_list)
        effective_ready_duration = c.duration_seconds if c.is_ready else ready_duration

        chapters.append(
            ChapterResponse(
                id=c.id,
                sequence=c.sequence,
                title=c.title,
                word_count=c.word_count,
                duration_seconds=c.duration_seconds,
                is_ready=c.is_ready,
                audio_sha256=c.audio_sha256,
                total_chunks=total_chunks,
                ready_chunks_count=ready_count,
                generating_chunks_count=generating_count,
                ready_duration_seconds=round(effective_ready_duration, 2),
                ready_chunks=ready_chunks_list,
            )
        )

    return BookDetailResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        mode=book.mode,
        created_at=book.created_at.isoformat(),
        chapters=chapters,
    )


@router.post("/import", response_model=BookDetailResponse)
def import_markdown_text(req: ImportMarkdownRequest, db: Session = Depends(get_db)):
    svc = BookService(db)
    book = svc.import_book_from_markdown(
        title=req.title,
        author=req.author,
        markdown_text=req.markdown_text,
        language=req.language,
        mode=req.mode,
    )
    return get_book(book.id, db)


@router.post("/upload", response_model=BookDetailResponse)
async def upload_markdown_file(
    title: str = Form(...),
    author: str = Form(""),
    language: str = Form("es"),
    mode: str = Form("auto"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content_bytes = await file.read()
    markdown_text = content_bytes.decode("utf-8", errors="replace")

    svc = BookService(db)
    book = svc.import_book_from_markdown(
        title=title,
        author=author,
        markdown_text=markdown_text,
        language=language,
        mode=mode,
        filename=file.filename or "",
    )
    return get_book(book.id, db)


@router.delete("/{book_id}")
def delete_book(book_id: str, db: Session = Depends(get_db)):
    repo = BookRepository(db)
    deleted = repo.delete(book_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Libro no encontrado")
    return {"success": True, "message": "Libro eliminado correctamente"}
