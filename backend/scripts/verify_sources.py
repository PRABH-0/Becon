"""Live verification script for Becon candidate official sources.

Fetches each candidate feed via HTTP, validates that it returns HTTP 200,
parses the feed via feedparser or advisory JSON schema, and reports items and latest date.
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

import feedparser
import httpx

# Ensure backend root is on sys.path
backend_root = str(Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from app.seed.seed import load_json

CANDIDATES: List[Dict[str, Any]] = load_json("sources.json")


def verify_source(source: Dict[str, Any], client: httpx.Client) -> Dict[str, Any]:
    url = source["feed_url"]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 BeconFeedValidator/1.0",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*",
    }
    result = {
        "slug": source["slug"],
        "name": source["name"],
        "type": source["source_type"],
        "feed_url": url,
        "topics": ", ".join(source["topics"]),
        "status_code": None,
        "parsed_items": 0,
        "latest_date": "N/A",
        "error": None,
        "is_valid": False,
    }

    try:
        fetch_url = url
        # Format-specific headers and query parameters
        if source["source_type"] == "advisory":
            if "api.github.com" in url:
                headers["Accept"] = "application/vnd.github+json"
                headers["X-GitHub-Api-Version"] = "2022-11-28"
                if "?" not in fetch_url:
                    fetch_url = f"{fetch_url}?per_page=30"
            elif "services.nvd.nist.gov" in url:
                now = datetime.now(timezone.utc)
                start = now - timedelta(days=2)
                start_str = start.strftime("%Y-%m-%dT%H:%M:%S.000")
                end_str = now.strftime("%Y-%m-%dT%H:%M:%S.000")
                fetch_url = f"{fetch_url}?lastModStartDate={start_str}&lastModEndDate={end_str}&resultsPerPage=30"

        response = client.get(fetch_url, headers=headers, follow_redirects=True, timeout=15.0)
        result["status_code"] = response.status_code

        if response.status_code == 200:
            if source["source_type"] == "advisory":
                # JSON Advisory Parsing
                data = json.loads(response.text)
                if isinstance(data, list):
                    # GitHub Advisory list
                    result["parsed_items"] = len(data)
                    if data:
                        result["latest_date"] = str(data[0].get("published_at", "N/A"))[:25]
                        result["is_valid"] = True
                elif isinstance(data, dict):
                    if "vulnerabilities" in data and "catalogVersion" in data:
                        # CISA KEV
                        vulns = sorted(
                            data.get("vulnerabilities", []),
                            key=lambda v: v.get("dateAdded", ""),
                            reverse=True,
                        )
                        result["parsed_items"] = len(vulns)
                        if vulns:
                            result["latest_date"] = str(vulns[0].get("dateAdded", "N/A"))[:25]
                            result["is_valid"] = True
                    elif "vulnerabilities" in data and "format" in data:
                        # NVD CVE
                        vulns = data.get("vulnerabilities", [])
                        result["parsed_items"] = len(vulns)
                        if vulns:
                            result["latest_date"] = str(vulns[0].get("cve", {}).get("published", "N/A"))[:25]
                            result["is_valid"] = True
            else:
                # RSS / Atom XML Parsing
                parsed = feedparser.parse(response.content)
                entries = parsed.entries
                result["parsed_items"] = len(entries)
                if entries:
                    first = entries[0]
                    date_str = (
                        first.get("published")
                        or first.get("updated")
                        or first.get("pubDate")
                        or parsed.feed.get("published")
                        or parsed.feed.get("updated")
                        or parsed.feed.get("lastBuildDate")
                        or "Unknown"
                    )
                    result["latest_date"] = str(date_str)[:25]
                    result["is_valid"] = len(entries) > 0
                else:
                    result["error"] = "0 entries parsed from feed"
        else:
            result["error"] = f"HTTP {response.status_code}"
    except Exception as e:
        result["error"] = str(e)

    return result


def main():
    output_markdown = "--markdown" in sys.argv
    slug_filter = None
    for arg in sys.argv[1:]:
        if arg.startswith("--slug="):
            slug_filter = arg.split("=", 1)[1].strip()

    candidates = CANDIDATES
    if slug_filter:
        candidates = [c for c in CANDIDATES if c["slug"] == slug_filter]

    results = []
    with httpx.Client() as client:
        if output_markdown:
            print("| slug | type | feed_url | HTTP status | parsed items | latest item date | topics |")
            print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
        else:
            print(f"Testing {len(candidates)} candidate sources with live HTTP requests...\n")

        for src in candidates:
            res = verify_source(src, client)
            results.append(res)
            if output_markdown:
                print(
                    f"| `{res['slug']}` | {res['type']} | {res['feed_url']} | {res['status_code']} | {res['parsed_items']} | {res['latest_date']} | {res['topics']} |"
                )
            else:
                mark = "[PASS]" if res["is_valid"] else "[FAIL]"
                print(
                    f"{mark} {res['slug']:<26} | {res['type']:<8} | {res['feed_url']:<55} | HTTP {res['status_code']} | items: {res['parsed_items']:<4} | latest: {res['latest_date']:<22} | topics: {res['topics']}"
                )

    if not output_markdown and not slug_filter:
        valid = [r for r in results if r["is_valid"]]
        print(f"\nSummary: {len(valid)}/{len(results)} valid feeds.")


if __name__ == "__main__":
    main()
