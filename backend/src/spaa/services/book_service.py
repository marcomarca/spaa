import uuid

from sqlalchemy.orm import Session

from spaa.adapters.db_models import (
    BookModel,
    BookVariantModel,
    ChapterModel,
    SectionModel,
    TtsChunkModel,
    TtsJobModel,
)
from spaa.adapters.storage import StorageAdapter
from spaa.domain.markdown_cleaner import MarkdownCleaner
from spaa.domain.segmentation import MarkdownSegmenter


class BookService:
    """Service to ingest markdown books, structure chapters, and generate TTS jobs."""

    def __init__(self, db: Session):
        self.db = db
        self.storage = StorageAdapter()
        self.segmenter = MarkdownSegmenter()

    def import_book_from_markdown(
        self,
        title: str,
        author: str,
        markdown_text: str,
        language: str = "es",
        mode: str = "auto",
        filename: str = "",
    ) -> BookModel:
        book_id = str(uuid.uuid4())
        variant_id = str(uuid.uuid4())

        # Save physical source markdown file
        self.storage.save_source_markdown(book_id, language, markdown_text)

        # Create Book entity
        book = BookModel(
            id=book_id,
            title=title,
            author=author,
            mode=mode,
        )
        self.db.add(book)

        # Create BookVariant entity
        variant = BookVariantModel(
            id=variant_id,
            book_id=book_id,
            language=language,
            source_filename=filename or f"{language}.md",
        )
        self.db.add(variant)

        # Parse chapters and sections
        parsed_chapters = self.segmenter.parse_document(markdown_text)

        for p_chap in parsed_chapters:
            chapter_id = str(uuid.uuid4())
            spoken_chapter = MarkdownCleaner.clean_for_tts(p_chap.raw_markdown)

            chapter = ChapterModel(
                id=chapter_id,
                book_id=book_id,
                variant_id=variant_id,
                sequence=p_chap.sequence,
                title=p_chap.title,
                source_text=p_chap.raw_markdown,
                prepared_text=p_chap.raw_markdown,
                spoken_text=spoken_chapter,
                word_count=MarkdownCleaner.count_words(spoken_chapter),
                is_ready=False,
            )
            self.db.add(chapter)

            # Add sections
            for s_idx, sec in enumerate(p_chap.sections, 1):
                sec_id = str(uuid.uuid4())
                section_model = SectionModel(
                    id=sec_id,
                    chapter_id=chapter_id,
                    sequence=s_idx,
                    title=sec.title,
                    level=sec.level,
                    content=sec.content,
                    word_count=sec.word_count,
                )
                self.db.add(section_model)

            # Segment chapter into spoken chunks <= 950 words
            chunks = self.segmenter.segment_chapter(p_chap)
            for chunk in chunks:
                chunk_id = str(uuid.uuid4())
                job_id = str(uuid.uuid4())

                tts_chunk = TtsChunkModel(
                    id=chunk_id,
                    book_id=book_id,
                    variant_id=variant_id,
                    chapter_id=chapter_id,
                    sequence=chunk.sequence,
                    source_text=chunk.raw_text,
                    spoken_text=chunk.spoken_text,
                    word_count=chunk.word_count,
                    language=language,
                    provider="f5",
                    model="f5_spanish",
                    voice="marco",
                    status="QUEUED",
                )
                self.db.add(tts_chunk)

                # Create associated TTS queue job
                tts_job = TtsJobModel(
                    id=job_id,
                    chunk_id=chunk_id,
                    status="QUEUED",
                    provider="f5",
                )
                self.db.add(tts_job)

        self.db.commit()
        self.db.refresh(book)
        return book
