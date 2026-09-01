import hashlib
from pathlib import Path
from typing import BinaryIO

from spaa.config import settings


class StorageAdapter:
    """Manages physical files, atomic operations, and SHA-256 verification."""

    def __init__(self):
        settings.ensure_directories()

    @staticmethod
    def calculate_sha256(file_path: Path) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()

    def get_book_dir(self, book_id: str) -> Path:
        book_dir = settings.library_dir / book_id
        book_dir.mkdir(parents=True, exist_ok=True)
        (book_dir / "source").mkdir(parents=True, exist_ok=True)
        (book_dir / "prepared").mkdir(parents=True, exist_ok=True)
        (book_dir / "audio" / "es").mkdir(parents=True, exist_ok=True)
        (book_dir / "audio" / "en").mkdir(parents=True, exist_ok=True)
        return book_dir

    def save_source_markdown(self, book_id: str, language: str, content: str) -> Path:
        book_dir = self.get_book_dir(book_id)
        file_path = book_dir / "source" / f"{language}.md"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return file_path

    def get_chapter_audio_path(self, book_id: str, language: str, chapter_seq: int) -> Path:
        book_dir = self.get_book_dir(book_id)
        return book_dir / "audio" / language / f"chapter_{chapter_seq:03d}.mp3"

    def get_temporary_wav_path(self, chunk_id: str) -> Path:
        return settings.temporary_dir / f"{chunk_id}.wav"

    def save_uploaded_file_atomic(self, file_obj: BinaryIO, target_path: Path) -> tuple[Path, str]:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_part_path = target_path.with_suffix(target_path.suffix + ".part")

        sha256 = hashlib.sha256()
        with open(temp_part_path, "wb") as f:
            while chunk := file_obj.read(65536):
                f.write(chunk)
                sha256.update(chunk)

        # Atomic rename
        if target_path.exists():
            target_path.unlink()
        temp_part_path.rename(target_path)

        return target_path, sha256.hexdigest()

    def cleanup_temporary_wav(self, wav_path: Path | str | None) -> None:
        if not wav_path:
            return
        p = Path(wav_path)
        if p.exists() and p.is_file():
            try:
                p.unlink()
            except OSError:
                pass
