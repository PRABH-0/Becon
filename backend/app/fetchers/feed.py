"""RSS, Atom, and GitHub Releases Feed Fetcher.

Parses syndicated feeds with feedparser, extracts canonical links, UTC timestamps,
authors, and substantial text. Performs a single polite full-text extraction fallback
for short feed snippets if needed.
"""

import logging
import time
import urllib.parse
from datetime import UTC, datetime, timedelta
from typing import Any, List

import feedparser

from app.fetchers.base import BaseFetcher, FetchItem, FetchResult, registry
from app.fetchers.http_client import SafeHTTPClient, parse_retry_after
from app.fetchers.sanitizer import (
    MAX_CONTENT_TEXT_LENGTH,
    MAX_SUMMARY_TEXT_LENGTH,
    clean_summary_text,
    sanitize_plain_text,
)
from app.ingestion import normalize_url
from app.models import Source

logger = logging.getLogger("becon.fetchers.feed")

DEFAULT_MAX_ITEMS_PER_FETCH = 30
DEFAULT_MAX_ITEM_AGE_DAYS = 90
SUBSTANTIAL_CONTENT_THRESHOLD_CHARS = 500


def parse_feed_datetime(entry: Any) -> datetime | None:
    """Extract and normalize UTC publication datetime from feedparser entry."""
    # Priority: published_parsed -> updated_parsed -> created_parsed
    time_struct = (
        entry.get("published_parsed")
        or entry.get("updated_parsed")
        or entry.get("created_parsed")
    )
    if time_struct:
        try:
            return datetime.fromtimestamp(time.mktime(time_struct), tz=UTC)
        except Exception:
            pass
    return None


def extract_entry_raw_content(entry: Any) -> tuple[str, str]:
    """Extract best available content text and determine whether full-text fetch is needed.

    Returns:
        (content_string, source_type_flag)
    """
    # 1. Check entry.content list (RFC 4287 Atom <content> or RSS content:encoded)
    contents = entry.get("content", [])
    if contents and isinstance(contents, list):
        for c in contents:
            if isinstance(c, dict) and c.get("value"):
                val = c["value"].strip()
                if len(val) >= 50:
                    return val, "feed_content"

    # 2. Check summary_detail or summary
    summary_detail = entry.get("summary_detail")
    if summary_detail and isinstance(summary_detail, dict) and summary_detail.get("value"):
        val = summary_detail["value"].strip()
        if len(val) >= 300:
            return val, "feed_summary"

    raw_summary = entry.get("summary", "").strip()
    if len(raw_summary) >= 300:
        return raw_summary, "feed_summary"

    # Return summary as snippet eligible for fallback article extraction
    return raw_summary, "snippet_only"


class FeedFetcher(BaseFetcher):
    """Fetcher for standard RSS 2.0, Atom 1.0, and GitHub Releases feeds."""

    def __init__(
        self,
        max_items: int = DEFAULT_MAX_ITEMS_PER_FETCH,
        max_age_days: int = DEFAULT_MAX_ITEM_AGE_DAYS,
    ) -> None:
        self.max_items = max_items
        self.max_age_days = max_age_days

    def fetch(
        self,
        source: Source,
        client: SafeHTTPClient,
        **kwargs: Any,
    ) -> FetchResult:
        start_time = time.time()
        max_items = kwargs.get("limit") or self.max_items
        max_age_days = kwargs.get("max_age_days") or self.max_age_days
        cutoff_date = datetime.now(UTC) - timedelta(days=max_age_days)

        try:
            response = client.get(
                url=source.feed_url,
                etag=source.etag,
                last_modified=source.last_modified,
            )
        except Exception as e:
            duration = time.time() - start_time
            logger.error("Failed to fetch feed %s (%s): %s", source.slug, source.feed_url, e)
            return FetchResult(
                status="error",
                error=str(e),
                duration_seconds=duration,
            )

        duration = time.time() - start_time

        # HTTP 304 Not Modified
        if response.status_code == 304:
            logger.info("Feed %s not modified (HTTP 304)", source.slug)
            return FetchResult(
                status="not_modified",
                new_etag=source.etag,
                new_last_modified=source.last_modified,
                http_status=304,
                duration_seconds=duration,
            )

        if response.status_code != 200:
            retry_after_sec = parse_retry_after(response.headers)
            return FetchResult(
                status="error",
                error=f"Unexpected HTTP status {response.status_code}",
                http_status=response.status_code,
                duration_seconds=duration,
                retry_after_seconds=retry_after_sec,
            )

        # Extract caching validators from response headers
        new_etag = response.headers.get("etag")
        new_last_modified = response.headers.get("last-modified")

        # Parse XML bytes with feedparser
        parsed = feedparser.parse(response.content)
        if parsed.bozo and not parsed.entries:
            bozo_exc = getattr(parsed, "bozo_exception", "Unknown XML parsing error")
            return FetchResult(
                status="error",
                error=f"Feed XML parse failure: {bozo_exc}",
                http_status=200,
                duration_seconds=duration,
            )

        items: List[FetchItem] = []
        entries = parsed.entries or []

        for entry in entries:
            # Canonical URL
            raw_url = entry.get("link") or entry.get("id") or ""
            if not raw_url:
                continue

            ext_id = entry.get("id") or entry.get("guid") or None

            # If entry link is generic site homepage or feed URL, disambiguate with entry id
            normalized_raw = normalize_url(raw_url)
            if ext_id and (normalized_raw == normalize_url(source.site_url) or normalized_raw == normalize_url(source.feed_url)):
                raw_url = f"{raw_url.rstrip('/')}?release={urllib.parse.quote(str(ext_id))}"

            canonical_url = normalize_url(raw_url)
            if not canonical_url.startswith("https://"):
                continue

            # Publication timestamp
            pub_date = parse_feed_datetime(entry)

            # Age filter: discard entries strictly older than cutoff
            if pub_date and pub_date < cutoff_date:
                continue

            # Title
            raw_title = entry.get("title") or "Untitled Update"
            clean_title = sanitize_plain_text(raw_title, max_length=500)

            # Author
            author = entry.get("author") or entry.get("creator") or None

            # Content & summary text
            raw_content, content_source = extract_entry_raw_content(entry)
            raw_summary = entry.get("summary") or ""
            clean_summary = clean_summary_text(raw_summary, max_length=MAX_SUMMARY_TEXT_LENGTH)

            extraction_status = content_source
            clean_content = sanitize_plain_text(raw_content, max_length=MAX_CONTENT_TEXT_LENGTH)

            # Full-text fallback: if snippet-only and canonical_url is distinct from feed_url
            if content_source == "snippet_only" and canonical_url and canonical_url != source.feed_url:
                try:
                    article_resp = client.get(canonical_url, allow_retry=False)
                    content_type = article_resp.headers.get("content-type", "").lower()
                    if article_resp.status_code == 200 and ("html" in content_type or not content_type):
                        extracted = sanitize_plain_text(article_resp.text, max_length=MAX_CONTENT_TEXT_LENGTH)
                        if len(extracted) > len(clean_content):
                            clean_content = extracted
                            extraction_status = "article_extracted"
                except Exception as ext_err:
                    logger.debug(
                        "Full-text extraction failed for %s (%s): %s",
                        canonical_url,
                        source.slug,
                        ext_err,
                    )
                    extraction_status = "fallback_summary"

            # External ID (e.g. GitHub release tag or feed GUID)
            ext_id = entry.get("id") or entry.get("guid") or None

            item = FetchItem(
                url=canonical_url,
                title=clean_title,
                external_id=str(ext_id) if ext_id else None,
                summary=clean_summary or None,
                content_text=clean_content or clean_summary or None,
                published_at=pub_date,
                author=author,
                raw_metadata={
                    "extraction_status": extraction_status,
                    "feed_type": source.source_type,
                },
            )
            items.append(item)

            if len(items) >= max_items:
                break

        return FetchResult(
            status="ok",
            items=items,
            new_etag=new_etag,
            new_last_modified=new_last_modified,
            http_status=200,
            duration_seconds=time.time() - start_time,
        )


# Register feed fetchers for standard syndicated formats
feed_fetcher_instance = FeedFetcher()
registry.register("rss", feed_fetcher_instance)
registry.register("atom", feed_fetcher_instance)
registry.register("github_release", feed_fetcher_instance)
registry.register("github_releases", feed_fetcher_instance)
