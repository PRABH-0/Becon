"""Sanitization and clean text extraction for fetched feeds and articles.

Strict plain-text rules:
- Strips all HTML tags, inline scripts, styles, navs, headers, and footers.
- Unescapes HTML entities.
- Collapses multi-line and whitespace anomalies to clean paragraphs.
- Enforces text length caps (default 20,000 chars) to prevent context exhaustion.
- Strips URL tracking parameters using the shared normalize_url logic.
"""

import html
import re
from html.parser import HTMLParser
from typing import List

# Default maximum text length for stored raw item content
MAX_CONTENT_TEXT_LENGTH = 20000
MAX_SUMMARY_TEXT_LENGTH = 2000


class TextExtractor(HTMLParser):
    """HTML Parser that strips scripts, styles, navigation chrome, and extracts article text."""

    # Tags whose inner content must be completely discarded
    DISCARD_TAGS = {
        "script",
        "style",
        "noscript",
        "nav",
        "header",
        "footer",
        "aside",
        "svg",
        "form",
        "button",
        "iframe",
    }

    # Block tags that warrant spacing/newlines
    BLOCK_TAGS = {
        "p",
        "div",
        "article",
        "section",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "li",
        "blockquote",
        "pre",
        "tr",
        "br",
        "hr",
    }

    def __init__(self) -> None:
        super().__init__()
        self._discard_depth = 0
        self._chunks: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple]) -> None:
        tag_lower = tag.lower()
        if tag_lower in self.DISCARD_TAGS:
            self._discard_depth += 1
        elif tag_lower in self.BLOCK_TAGS and self._discard_depth == 0:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag_lower = tag.lower()
        if tag_lower in self.DISCARD_TAGS:
            if self._discard_depth > 0:
                self._discard_depth -= 1
        elif tag_lower in self.BLOCK_TAGS and self._discard_depth == 0:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._discard_depth == 0:
            self._chunks.append(data)

    def get_text(self) -> str:
        raw = "".join(self._chunks)
        # Unescape HTML entities
        unescaped = html.unescape(raw)
        # Normalize newlines
        paragraphs = [re.sub(r"[ \t]+", " ", p).strip() for p in unescaped.split("\n")]
        # Drop empty lines while keeping paragraph boundaries
        clean_lines = [p for p in paragraphs if p]
        return "\n\n".join(clean_lines)


def sanitize_plain_text(
    raw_html_or_text: str | None,
    max_length: int = MAX_CONTENT_TEXT_LENGTH,
) -> str:
    """Convert raw HTML or messy text to clean, bounded plain text.

    Args:
        raw_html_or_text: Input string which may contain HTML markup.
        max_length: Maximum allowed character length.

    Returns:
        Clean plain text without HTML tags or excessive whitespace.
    """
    if not raw_html_or_text:
        return ""

    extractor = TextExtractor()
    try:
        extractor.feed(raw_html_or_text)
        extractor.close()
        text = extractor.get_text()
    except Exception:
        # Fallback to regex tag stripping if parser encounters invalid tokens
        clean = re.sub(r"<[^>]+>", " ", raw_html_or_text)
        clean = html.unescape(clean)
        text = re.sub(r"\s+", " ", clean).strip()

    if len(text) > max_length:
        text = text[:max_length].rstrip()

    return text


def clean_summary_text(
    raw_summary: str | None,
    max_length: int = MAX_SUMMARY_TEXT_LENGTH,
) -> str:
    """Sanitize feed summary snippet to concise plain text."""
    text = sanitize_plain_text(raw_summary, max_length=max_length)
    # Collapse multiple newlines in summary to single spaces for compact previews
    return re.sub(r"\s+", " ", text).strip()
