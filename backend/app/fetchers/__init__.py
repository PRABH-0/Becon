"""Becon Source Fetchers package.

Provides safe, SSRF-protected, conditional-GET-enabled fetchers for:
- RSS / Atom syndicated feeds and GitHub Releases atom feeds (FeedFetcher)
- Security Advisories (AdvisoryFetcher: GHSA, CISA KEV, NVD CVE 2.0)
- Manual fetch runner and CLI interface
"""

# Import fetcher modules so their implementations register with FetcherRegistry
import app.fetchers.advisory  # noqa: F401
import app.fetchers.feed  # noqa: F401
from app.fetchers.base import (
    BaseFetcher,
    FetcherRegistry,
    FetchItem,
    FetchResult,
    registry,
)
from app.fetchers.http_client import (
    DEFAULT_USER_AGENT,
    MAX_REDIRECTS,
    MAX_RESPONSE_BYTES,
    FetcherError,
    InsecureSchemeError,
    MaxRedirectsExceededError,
    ResponseTooLargeError,
    SafeHTTPClient,
    SafeResponse,
    SSRFError,
    sanitize_error_message,
    validate_url_safety,
)
from app.fetchers.runner import SourceFetchSummary, fetch_and_store_source, run_fetch

__all__ = [
    "BaseFetcher",
    "FetchItem",
    "FetchResult",
    "FetcherRegistry",
    "registry",
    "SafeHTTPClient",
    "SafeResponse",
    "FetcherError",
    "SSRFError",
    "InsecureSchemeError",
    "ResponseTooLargeError",
    "MaxRedirectsExceededError",
    "sanitize_error_message",
    "validate_url_safety",
    "SourceFetchSummary",
    "fetch_and_store_source",
    "run_fetch",
    "DEFAULT_USER_AGENT",
    "MAX_RESPONSE_BYTES",
    "MAX_REDIRECTS",
]
