import re
from dataclasses import dataclass
from typing import List

from spaa.domain.markdown_cleaner import MarkdownCleaner


@dataclass
class ParsedSection:
    title: str
    level: int
    content: str
    word_count: int


@dataclass
class ParsedChapter:
    title: str
    sequence: int
    raw_markdown: str
    sections: List[ParsedSection]
    word_count: int


@dataclass
class SegmentedChunk:
    sequence: int
    raw_text: str
    spoken_text: str
    word_count: int
    section_title: str | None = None


class MarkdownSegmenter:
    """Deterministic segmenter for Markdown according to SPAA specification.

    Target: 800-900 words.
    Soft max: 900 words.
    Hard max: 950 words.
    Semantic cut hierarchy: Section -> Paragraph -> List -> Sentence.
    """

    def __init__(self, target_words: int = 850, hard_max_words: int = 950):
        self.target_words = target_words
        self.hard_max_words = hard_max_words

    def parse_document(self, markdown_text: str) -> List[ParsedChapter]:
        """Parses a full markdown book into structured chapters and sections."""
        if not markdown_text or not markdown_text.strip():
            return []

        # Split into chapters by H1 (# ) or H2 (## )
        # If document has H1s, use H1 as book/chapter division, else H2
        lines = markdown_text.strip().split("\n")
        h1_matches = [line for line in lines if re.match(r"^#\s+(.+)$", line)]

        chapter_header_pattern = r"^#\s+(.+)$" if len(h1_matches) > 1 else r"^##\s+(.+)$"
        if len(h1_matches) <= 1:
            h2_matches = [line for line in lines if re.match(r"^##\s+(.+)$", line)]
            if not h2_matches and h1_matches:
                chapter_header_pattern = r"^#\s+(.+)$"

        chapters: List[ParsedChapter] = []
        current_title = "Capítulo 1"
        current_lines: List[str] = []
        chapter_seq = 1

        for line in lines:
            header_match = re.match(chapter_header_pattern, line)
            if header_match:
                if current_lines:
                    raw = "\n".join(current_lines).strip()
                    if raw:
                        sections = self._parse_sections(raw)
                        total_words = sum(s.word_count for s in sections)
                        chapters.append(
                            ParsedChapter(
                                title=current_title,
                                sequence=chapter_seq,
                                raw_markdown=raw,
                                sections=sections,
                                word_count=total_words,
                            )
                        )
                        chapter_seq += 1
                current_title = header_match.group(1).strip()
                current_lines = [line]
            else:
                current_lines.append(line)

        if current_lines:
            raw = "\n".join(current_lines).strip()
            if raw:
                sections = self._parse_sections(raw)
                total_words = sum(s.word_count for s in sections)
                chapters.append(
                    ParsedChapter(
                        title=current_title,
                        sequence=chapter_seq,
                        raw_markdown=raw,
                        sections=sections,
                        word_count=total_words,
                    )
                )

        # Fallback if no headers matched at all
        if not chapters and markdown_text.strip():
            raw = markdown_text.strip()
            sections = self._parse_sections(raw)
            chapters.append(
                ParsedChapter(
                    title="Capítulo 1",
                    sequence=1,
                    raw_markdown=raw,
                    sections=sections,
                    word_count=sum(s.word_count for s in sections),
                )
            )

        return chapters

    def _parse_sections(self, chapter_markdown: str) -> List[ParsedSection]:
        lines = chapter_markdown.split("\n")
        sections: List[ParsedSection] = []
        current_title = "Introducción"
        current_level = 2
        current_content_lines: List[str] = []

        for line in lines:
            match = re.match(r"^(#{2,4})\s+(.+)$", line)
            if match:
                if current_content_lines:
                    content = "\n".join(current_content_lines).strip()
                    sections.append(
                        ParsedSection(
                            title=current_title,
                            level=current_level,
                            content=content,
                            word_count=MarkdownCleaner.count_words(content),
                        )
                    )
                    current_content_lines = []
                current_level = len(match.group(1))
                current_title = match.group(2).strip()
                current_content_lines.append(line)
            else:
                current_content_lines.append(line)

        if current_content_lines:
            content = "\n".join(current_content_lines).strip()
            sections.append(
                ParsedSection(
                    title=current_title,
                    level=current_level,
                    content=content,
                    word_count=MarkdownCleaner.count_words(content),
                )
            )

        return sections

    def segment_chapter(self, chapter: ParsedChapter) -> List[SegmentedChunk]:
        """Segments a chapter into spoken chunks <= hard_max_words (default 950)."""
        chunks: List[SegmentedChunk] = []

        # Collect atomic units (paragraphs, headers with following paragraphs, or sentences)
        units = self._extract_atomic_units(chapter.raw_markdown)
        current_unit_group: List[str] = []
        current_words = 0
        chunk_seq = 1

        for unit in units:
            unit_words = MarkdownCleaner.count_words(unit)

            # If single unit exceeds hard_max, split by sentences
            if unit_words > self.hard_max_words:
                sub_sentences = self._split_into_sentences(unit)
                for sentence in sub_sentences:
                    sentence_words = MarkdownCleaner.count_words(sentence)
                    if current_words + sentence_words > self.hard_max_words and current_unit_group:
                        raw_chunk = "\n\n".join(current_unit_group).strip()
                        spoken = MarkdownCleaner.clean_for_tts(raw_chunk)
                        chunks.append(
                            SegmentedChunk(
                                sequence=chunk_seq,
                                raw_text=raw_chunk,
                                spoken_text=spoken,
                                word_count=MarkdownCleaner.count_words(spoken),
                                section_title=chapter.title,
                            )
                        )
                        chunk_seq += 1
                        current_unit_group = []
                        current_words = 0

                    current_unit_group.append(sentence)
                    current_words += sentence_words
                continue

            if current_words + unit_words > self.hard_max_words and current_unit_group:
                raw_chunk = "\n\n".join(current_unit_group).strip()
                spoken = MarkdownCleaner.clean_for_tts(raw_chunk)
                chunks.append(
                    SegmentedChunk(
                        sequence=chunk_seq,
                        raw_text=raw_chunk,
                        spoken_text=spoken,
                        word_count=MarkdownCleaner.count_words(spoken),
                        section_title=chapter.title,
                    )
                )
                chunk_seq += 1
                current_unit_group = [unit]
                current_words = unit_words
            else:
                current_unit_group.append(unit)
                current_words += unit_words

        if current_unit_group:
            raw_chunk = "\n\n".join(current_unit_group).strip()
            spoken = MarkdownCleaner.clean_for_tts(raw_chunk)
            chunks.append(
                SegmentedChunk(
                    sequence=chunk_seq,
                    raw_text=raw_chunk,
                    spoken_text=spoken,
                    word_count=MarkdownCleaner.count_words(spoken),
                    section_title=chapter.title,
                )
            )

        return chunks

    def _extract_atomic_units(self, markdown_text: str) -> List[str]:
        """Splits markdown into atomic paragraphs, binding headers to their first paragraph."""
        paragraphs = re.split(r"\n{2,}", markdown_text.strip())
        units: List[str] = []
        pending_header = ""

        for p in paragraphs:
            p = p.strip()
            if not p:
                continue

            # Check if paragraph is purely a header (#, ##, ###)
            if re.match(r"^#{1,6}\s+.+$", p) and "\n" not in p:
                if pending_header:
                    pending_header += "\n\n" + p
                else:
                    pending_header = p
            else:
                if pending_header:
                    # Bind header with immediate next paragraph
                    units.append(f"{pending_header}\n\n{p}")
                    pending_header = ""
                else:
                    units.append(p)

        if pending_header:
            units.append(pending_header)

        return units

    def _split_into_sentences(self, text: str) -> List[str]:
        # Split on punctuation (. ? !) followed by whitespace, keeping abbreviations safe
        sentences = re.split(r"(?<=[.?!])\s+(?=[A-ZÁÉÍÓÚÑa-záéíóúñ0-9])", text)
        return [s.strip() for s in sentences if s.strip()]
