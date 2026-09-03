from __future__ import annotations

import uuid
from pathlib import Path

from spaa.adapters.database import SessionLocal
from spaa.adapters.db_models import BookModel, ChapterModel, TtsChunkModel, TtsJobModel
from spaa.domain.models import DEFAULT_QWEN_INSTRUCT
from spaa.domain.segmentation import MarkdownSegmenter, ParsedChapter


def resegment_pending_chapters() -> None:
    db = SessionLocal()
    segmenter = MarkdownSegmenter(target_words=100, hard_max_words=110)

    try:
        book = db.query(BookModel).first()
        if not book:
            print("No se encontró ningún libro.")
            return

        print(f"Re-segmentando libro: '{book.title}'")
        chapters = (
            db.query(ChapterModel)
            .filter_by(book_id=book.id)
            .order_by(ChapterModel.sequence)
            .all()
        )

        total_new_chunks = 0
        preserved_chapters = 0

        for chap in chapters:
            if chap.is_ready:
                print(f"  [CONSERVADO] Cap {chap.sequence}: '{chap.title}' (Ya compilado)")
                preserved_chapters += 1
                continue

            # Eliminar trabajos y chunks anteriores no listos
            old_chunks = db.query(TtsChunkModel).filter_by(chapter_id=chap.id).all()
            for old_c in old_chunks:
                db.query(TtsJobModel).filter_by(chunk_id=old_c.id).delete()
                db.delete(old_c)

            # Re-segmentar con granularidad de 100 palabras
            p_chap = ParsedChapter(
                title=chap.title,
                sequence=chap.sequence,
                raw_markdown=chap.source_text,
                sections=[],
                word_count=chap.word_count,
            )
            new_chunks = segmenter.segment_chapter(p_chap)

            words_summary = [c.word_count for c in new_chunks]
            print(
                f"  [RE-SEGMENTADO] Cap {chap.sequence}: '{chap.title[:30]}' -> {len(new_chunks)} micro-bloques | Palabras: {words_summary[:5]}..."
            )

            for c in new_chunks:
                chunk_id = str(uuid.uuid4())
                job_id = str(uuid.uuid4())

                tts_chunk = TtsChunkModel(
                    id=chunk_id,
                    book_id=book.id,
                    variant_id=chap.variant_id,
                    chapter_id=chap.id,
                    sequence=c.sequence,
                    source_text=c.raw_text,
                    spoken_text=c.spoken_text,
                    word_count=c.word_count,
                    language="es",
                    provider="qwen",
                    model="qwen3-tts-1.7b",
                    voice="Ryan",
                    instruct=DEFAULT_QWEN_INSTRUCT,
                    status="QUEUED",
                )
                db.add(tts_chunk)

                tts_job = TtsJobModel(
                    id=job_id,
                    chunk_id=chunk_id,
                    status="QUEUED",
                    provider="qwen",
                )
                db.add(tts_job)
                total_new_chunks += 1

        db.commit()
        print(f"\n✓ Proceso completado:")
        print(f"  - Capítulos preservados: {preserved_chapters}")
        print(f"  - Nuevos micro-bloques (90-110 palabras) creados: {total_new_chunks}")

    finally:
        db.close()


if __name__ == "__main__":
    resegment_pending_chapters()
