"""Security Advisory Fetchers for GitHub Advisory Database (GHSA), CISA KEV, and NVD CVE 2.0.

Captures structured severity, CVSS scores, CVE IDs, affected packages, and dates
into raw_metadata for downstream severity scoring (Decision D7) without calling Gemini.
"""

import json
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, List
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from app.config import settings
from app.fetchers.base import BaseFetcher, FetchItem, FetchResult, registry
from app.fetchers.http_client import SafeHTTPClient
from app.fetchers.sanitizer import (
    MAX_CONTENT_TEXT_LENGTH,
    MAX_SUMMARY_TEXT_LENGTH,
    clean_summary_text,
    sanitize_plain_text,
)
from app.models import Source

logger = logging.getLogger("becon.fetchers.advisory")

DEFAULT_MAX_ITEMS_PER_FETCH = 30
DEFAULT_MAX_ADVISORY_AGE_DAYS = 90
NVD_DEFAULT_WINDOW_DAYS = 2


def extract_ghsa_items(
    raw_data: List[Dict[str, Any]],
    cutoff_date: datetime,
    max_items: int,
) -> List[FetchItem]:
    """Extract FetchItems from GitHub Advisory Database JSON array."""
    items: List[FetchItem] = []
    for entry in raw_data:
        ghsa_id = entry.get("ghsa_id")
        if not ghsa_id:
            continue

        # Published date
        pub_str = entry.get("published_at")
        pub_date = None
        if pub_str:
            try:
                pub_date = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
            except Exception:
                pass

        if pub_date and pub_date < cutoff_date:
            continue

        cve_id = entry.get("cve_id")
        cve_ids = [cve_id] if cve_id else []

        html_url = entry.get("html_url") or f"https://github.com/advisories/{ghsa_id}"
        summary = entry.get("summary") or f"Security advisory {ghsa_id}"
        description = entry.get("description") or summary

        # Extract affected package names
        affected_packages = []
        for vuln in entry.get("vulnerabilities", []):
            pkg = vuln.get("package", {})
            name = pkg.get("name")
            ecosystem = pkg.get("ecosystem")
            if name:
                label = f"{ecosystem}:{name}" if ecosystem else name
                if label not in affected_packages:
                    affected_packages.append(label)

        # CVSS and Severity
        severity = (entry.get("severity") or "unknown").lower()
        cvss = entry.get("cvss") or {}
        cvss_score = cvss.get("score")
        cvss_vector = cvss.get("vector_string")

        metadata: Dict[str, Any] = {
            "source_kind": "github_advisory",
            "advisory_id": ghsa_id,
            "cve_ids": cve_ids,
            "severity": severity,
            "cvss_score": cvss_score,
            "cvss_vector": cvss_vector,
            "affected_packages": affected_packages,
            "published_at": pub_str,
            "updated_at": entry.get("updated_at"),
        }

        clean_title = sanitize_plain_text(f"{ghsa_id}: {summary}", max_length=500)
        clean_desc = sanitize_plain_text(description, max_length=MAX_CONTENT_TEXT_LENGTH)
        clean_summ = clean_summary_text(summary, max_length=MAX_SUMMARY_TEXT_LENGTH)

        items.append(
            FetchItem(
                url=html_url,
                title=clean_title,
                external_id=ghsa_id,
                summary=clean_summ or None,
                content_text=clean_desc or None,
                published_at=pub_date,
                raw_metadata=metadata,
            )
        )
        if len(items) >= max_items:
            break

    return items


def extract_cisa_kev_items(
    raw_data: Dict[str, Any],
    cutoff_date: datetime,
    max_items: int,
) -> List[FetchItem]:
    """Extract FetchItems from CISA Known Exploited Vulnerabilities catalog JSON."""
    items: List[FetchItem] = []
    vulns = raw_data.get("vulnerabilities", [])

    # Sort in reverse chronological order by dateAdded
    sorted_vulns = sorted(
        vulns,
        key=lambda v: v.get("dateAdded", ""),
        reverse=True,
    )

    for vuln in sorted_vulns:
        cve_id = vuln.get("cveID")
        if not cve_id:
            continue

        date_added_str = vuln.get("dateAdded")
        pub_date = None
        if date_added_str:
            try:
                pub_date = datetime.fromisoformat(date_added_str).replace(tzinfo=UTC)
            except Exception:
                pass

        if pub_date and pub_date < cutoff_date:
            continue

        vendor = vuln.get("vendorProject", "Unknown Vendor")
        product = vuln.get("product", "Unknown Product")
        vuln_name = vuln.get("vulnerabilityName", "Exploited Vulnerability")
        short_desc = vuln.get("shortDescription", "")
        req_action = vuln.get("requiredAction", "Apply updates as per vendor instructions.")
        due_date = vuln.get("dueDate", "")

        title = f"{cve_id} - {vendor} {product}: {vuln_name}"
        canonical_url = f"https://nvd.nist.gov/vuln/detail/{cve_id}"

        body = (
            f"Vulnerability: {vuln_name}\n\n"
            f"Vendor/Project: {vendor}\n"
            f"Affected Product: {product}\n"
            f"Date Added to KEV Catalog: {date_added_str}\n"
            f"Action Required: {req_action}\n"
            f"Action Due Date: {due_date}\n\n"
            f"Description:\n{short_desc}"
        )

        metadata: Dict[str, Any] = {
            "source_kind": "cisa_kev",
            "advisory_id": cve_id,
            "cve_ids": [cve_id],
            "severity": "critical",  # Known actively exploited in the wild
            "vendor_project": vendor,
            "product": product,
            "date_added": date_added_str,
            "due_date": due_date,
            "required_action": req_action,
            "known_ransomware_campaign_use": vuln.get("knownRansomwareCampaignUse"),
        }

        clean_title = sanitize_plain_text(title, max_length=500)
        clean_desc = sanitize_plain_text(body, max_length=MAX_CONTENT_TEXT_LENGTH)
        clean_summ = clean_summary_text(short_desc, max_length=MAX_SUMMARY_TEXT_LENGTH)

        items.append(
            FetchItem(
                url=canonical_url,
                title=clean_title,
                external_id=cve_id,
                summary=clean_summ or None,
                content_text=clean_desc or None,
                published_at=pub_date,
                raw_metadata=metadata,
            )
        )
        if len(items) >= max_items:
            break

    return items


def extract_nvd_items(
    raw_data: Dict[str, Any],
    max_items: int,
) -> List[FetchItem]:
    """Extract FetchItems from NVD CVE 2.0 REST API JSON response."""
    items: List[FetchItem] = []
    vulnerabilities = raw_data.get("vulnerabilities", [])

    for entry in vulnerabilities:
        cve = entry.get("cve", {})
        cve_id = cve.get("id")
        if not cve_id:
            continue

        # Extract descriptions (prefer English)
        descriptions = cve.get("descriptions", [])
        desc_text = ""
        for d in descriptions:
            if d.get("lang") == "en":
                desc_text = d.get("value", "")
                break
        if not desc_text and descriptions:
            desc_text = descriptions[0].get("value", "")

        # Extract published timestamp
        pub_str = cve.get("published")
        pub_date = None
        if pub_str:
            try:
                pub_date = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
            except Exception:
                pass

        # Extract CVSS Metrics
        metrics = cve.get("metrics", {})
        severity = "unknown"
        cvss_score = None
        cvss_vector = None

        # Try CVSS v3.1, then v3.0, then v2.0
        for v3_key in ("cvssMetricV31", "cvssMetricV30"):
            v3_list = metrics.get(v3_key, [])
            if v3_list:
                primary = v3_list[0].get("cvssData", {})
                severity = (primary.get("baseSeverity") or "unknown").lower()
                cvss_score = primary.get("baseScore")
                cvss_vector = primary.get("vectorString")
                break

        if severity == "unknown" and metrics.get("cvssMetricV2"):
            v2_list = metrics.get("cvssMetricV2", [])
            if v2_list:
                primary = v2_list[0].get("cvssData", {})
                cvss_score = primary.get("baseScore")
                cvss_vector = primary.get("vectorString")
                # Base score heuristic for v2
                if cvss_score is not None:
                    if cvss_score >= 7.0:
                        severity = "high"
                    elif cvss_score >= 4.0:
                        severity = "medium"
                    else:
                        severity = "low"

        title = f"{cve_id}: {desc_text[:120].strip()}..." if len(desc_text) > 120 else f"{cve_id}"
        canonical_url = f"https://nvd.nist.gov/vuln/detail/{cve_id}"

        metadata: Dict[str, Any] = {
            "source_kind": "nvd_cve",
            "advisory_id": cve_id,
            "cve_ids": [cve_id],
            "severity": severity,
            "cvss_score": cvss_score,
            "cvss_vector": cvss_vector,
            "published_at": pub_str,
            "last_modified": cve.get("lastModified"),
        }

        clean_title = sanitize_plain_text(title, max_length=500)
        clean_desc = sanitize_plain_text(desc_text, max_length=MAX_CONTENT_TEXT_LENGTH)
        clean_summ = clean_summary_text(desc_text, max_length=MAX_SUMMARY_TEXT_LENGTH)

        items.append(
            FetchItem(
                url=canonical_url,
                title=clean_title,
                external_id=cve_id,
                summary=clean_summ or None,
                content_text=clean_desc or None,
                published_at=pub_date,
                raw_metadata=metadata,
            )
        )
        if len(items) >= max_items:
            break

    return items


class AdvisoryFetcher(BaseFetcher):
    """Unified fetcher for official security advisory endpoints (GHSA, CISA KEV, NVD)."""

    def __init__(
        self,
        max_items: int = DEFAULT_MAX_ITEMS_PER_FETCH,
        max_age_days: int = DEFAULT_MAX_ADVISORY_AGE_DAYS,
    ) -> None:
        self.max_items = max_items
        self.max_age_days = max_age_days

    def _build_nvd_url(self, base_url: str, window_days: int) -> str:
        """Construct NVD 2.0 query with bounded ISO-8601 lastMod dates and resultsPerPage."""
        now = datetime.now(UTC)
        start = now - timedelta(days=window_days)
        start_str = start.strftime("%Y-%m-%dT%H:%M:%S.000")
        end_str = now.strftime("%Y-%m-%dT%H:%M:%S.000")

        parsed = urlparse(base_url)
        params = parse_qs(parsed.query)
        params["lastModStartDate"] = [start_str]
        params["lastModEndDate"] = [end_str]
        params["resultsPerPage"] = [str(self.max_items)]
        new_query = urlencode(params, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

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

        req_headers: Dict[str, str] = {
            "Accept": "application/json, application/vnd.github+json, */*",
        }

        feed_url = source.feed_url

        # Check for GitHub Advisories API
        if "api.github.com" in feed_url:
            req_headers["X-GitHub-Api-Version"] = "2022-11-28"
            github_token = settings.GITHUB_TOKEN
            if github_token:
                req_headers["Authorization"] = f"Bearer {github_token}"
            if "?" not in feed_url:
                feed_url = f"{feed_url}?per_page={max_items}"

        # Check for NVD CVE 2.0 API
        elif "services.nvd.nist.gov" in feed_url:
            nvd_key = settings.NVD_API_KEY
            if nvd_key:
                req_headers["apiKey"] = nvd_key
            feed_url = self._build_nvd_url(feed_url, window_days=NVD_DEFAULT_WINDOW_DAYS)

        try:
            response = client.get(
                url=feed_url,
                headers=req_headers,
                etag=source.etag,
                last_modified=source.last_modified,
            )
        except Exception as e:
            duration = time.time() - start_time
            logger.error("Failed to fetch advisory source %s: %s", source.slug, e)
            return FetchResult(
                status="error",
                error=str(e),
                duration_seconds=duration,
            )

        duration = time.time() - start_time

        # HTTP 304 Not Modified
        if response.status_code == 304:
            return FetchResult(
                status="not_modified",
                new_etag=source.etag,
                new_last_modified=source.last_modified,
                http_status=304,
                duration_seconds=duration,
            )

        if response.status_code != 200:
            return FetchResult(
                status="error",
                error=f"Unexpected HTTP status {response.status_code}",
                http_status=response.status_code,
                duration_seconds=duration,
            )

        new_etag = response.headers.get("etag")
        new_last_modified = response.headers.get("last-modified")

        try:
            raw_json = json.loads(response.text)
        except Exception as json_err:
            return FetchResult(
                status="error",
                error=f"JSON decode failure: {json_err}",
                http_status=200,
                duration_seconds=duration,
            )

        # Dispatch parsing according to the endpoint payload shape
        if "api.github.com" in source.feed_url or isinstance(raw_json, list):
            items = extract_ghsa_items(raw_json, cutoff_date=cutoff_date, max_items=max_items)
        elif "cisa.gov" in source.feed_url or "vulnerabilities" in raw_json and "catalogVersion" in raw_json:
            items = extract_cisa_kev_items(raw_json, cutoff_date=cutoff_date, max_items=max_items)
        elif "services.nvd.nist.gov" in source.feed_url or "format" in raw_json and "vulnerabilities" in raw_json:
            items = extract_nvd_items(raw_json, max_items=max_items)
        else:
            return FetchResult(
                status="error",
                error=f"Unrecognized advisory payload structure for source {source.slug}",
                http_status=200,
                duration_seconds=duration,
            )

        return FetchResult(
            status="ok",
            items=items,
            new_etag=new_etag,
            new_last_modified=new_last_modified,
            http_status=200,
            duration_seconds=duration,
        )


# Register advisory fetcher
advisory_fetcher_instance = AdvisoryFetcher()
registry.register("advisory", advisory_fetcher_instance)
