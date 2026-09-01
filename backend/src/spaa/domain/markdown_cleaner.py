import re


class MarkdownCleaner:
    """Deterministic converter from Markdown (SOURCE/PREPARED) to clean spoken text (SPOKEN)."""

    @staticmethod
    def clean_for_tts(text: str) -> str:
        if not text:
            return ""

        # Remove image tags: ![alt](url)
        cleaned = re.sub(r"!\[(.*?)\]\(.*?\)", "", text)

        # Convert links: [text](url) -> text
        cleaned = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", cleaned)

        # Remove HTML tags if any
        cleaned = re.sub(r"<[^>]+>", "", cleaned)

        # Handle code blocks: ```python ... ``` -> remove backticks, keep text or summarize
        cleaned = re.sub(r"```[\w-]*\n([\s\S]*?)```", r"\1", cleaned)

        # Inline code: `code` -> code
        cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)

        # Bold / Italics / Strikethrough: **text**, *text*, __text__, _text_, ~~text~~
        cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
        cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
        cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
        cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)
        cleaned = re.sub(r"~~([^~]+)~~", r"\1", cleaned)

        # Blockquotes: > quote -> quote
        cleaned = re.sub(r"^>\s*", "", cleaned, flags=re.MULTILINE)

        # Headers: # Header -> Header
        cleaned = re.sub(r"^#{1,6}\s+(.+)$", r"\1.", cleaned, flags=re.MULTILINE)

        # Unordered list markers: * item, - item, + item -> item
        cleaned = re.sub(r"^\s*[-*+]\s+", "", cleaned, flags=re.MULTILINE)

        # Ordered list markers: 1. item -> item
        cleaned = re.sub(r"^\s*\d+\.\s+", "", cleaned, flags=re.MULTILINE)

        # Collapse horizontal rules: ---, ***, ___
        cleaned = re.sub(r"^[-*_]{3,}\s*$", "", cleaned, flags=re.MULTILINE)

        # Normalize multiple newlines and spaces
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        cleaned = re.sub(r"[ \t]+", " ", cleaned)

        return cleaned.strip()

    @staticmethod
    def count_words(text: str) -> int:
        if not text or not text.strip():
            return 0
        return len(text.strip().split())
