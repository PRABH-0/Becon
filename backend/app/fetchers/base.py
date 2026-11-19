"""Base data structures, fetcher interface, and registry for Becon fetchers.

Architecture:
- FetchItem: Standard normalized representation of an item extracted from any source.
- FetchResult: Structured result of fetching a source (items, validators, status, error, timing).
- BaseFetcher: Interface implemented by format-specific fetchers (RSS/Atom, GitHub Releases, Advisories).
- FetcherRegistry: Dispatch registry mapping source_type strings to fetcher instances.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List

from app.models import Source


@dataclass
class FetchItem:
    """Normalized content item extracted from any external source."""

    url: str
    title: str
    external_id: str | None = None
    summary: str | None = None
    content_text: str | None = None
    published_at: datetime | None = None
    author: str | None = None
    raw_metadata: Dict[str, Any] | None = None


@dataclass
class FetchResult:
    """Result of fetching an external source."""

    status: str  # "ok", "not_modified", "error", "skipped"
    items: List[FetchItem] = field(default_factory=list)
    new_etag: str | None = None
    new_last_modified: str | None = None
    error: str | None = None
    http_status: int | None = None
    duration_seconds: float = 0.0
    retry_after_seconds: float | None = None


class BaseFetcher(ABC):
    """Interface for source fetchers."""

    @abstractmethod
    def fetch(
        self,
        source: Source,
        client: Any,
        **kwargs: Any,
    ) -> FetchResult:
        """Fetch and extract items from the external source.

        Args:
            source: The Source database model instance.
            client: SafeHTTPClient instance.
            **kwargs: Additional parameters (e.g. limit, max_age_days).

        Returns:
            FetchResult containing extracted items or status code.
        """
        pass


class FetcherRegistry:
    """Registry mapping source_type strings to fetcher instances.

    Profession-agnostic: source types are data strings dispatched at runtime.
    """

    def __init__(self) -> None:
        self._registry: Dict[str, BaseFetcher] = {}

    def register(self, source_type: str, fetcher: BaseFetcher) -> None:
        """Register a fetcher instance for a given source_type."""
        self._registry[source_type.lower().strip()] = fetcher

    def get(self, source_type: str) -> BaseFetcher | None:
        """Retrieve registered fetcher for a given source_type."""
        return self._registry.get(source_type.lower().strip())

    def list_types(self) -> List[str]:
        """List all registered source_type strings."""
        return sorted(list(self._registry.keys()))


# Global registry singleton
registry = FetcherRegistry()
