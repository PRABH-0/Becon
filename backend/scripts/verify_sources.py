"""Live verification script for Becon candidate official sources.

Fetches each candidate feed via HTTP, validates that it returns HTTP 200,
parses the feed via feedparser, and reports items and latest date.
"""

import sys
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
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
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
        response = client.get(url, headers=headers, follow_redirects=True, timeout=10.0)
        result["status_code"] = response.status_code
        if response.status_code == 200:
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
    import sys

    output_markdown = "--markdown" in sys.argv
    results = []
    with httpx.Client() as client:
        if output_markdown:
            print("| slug | type | feed_url | HTTP status | parsed items | latest item date | topics |")
            print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
        else:
            print(f"Testing {len(CANDIDATES)} candidate sources with live HTTP requests...\n")

        for src in CANDIDATES:
            res = verify_source(src, client)
            results.append(res)
            if output_markdown:
                print(
                    f"| `{res['slug']}` | {res['type']} | {res['feed_url']} | {res['status_code']} | {res['parsed_items']} | {res['latest_date']} | {res['topics']} |"
                )
            else:
                mark = "[PASS]" if res["is_valid"] else "[FAIL]"
                print(
                    f"{mark} {res['slug']:<25} | {res['type']:<6} | {res['feed_url']:<50} | HTTP {res['status_code']} | items: {res['parsed_items']:<4} | latest: {res['latest_date']:<22} | topics: {res['topics']}"
                )

    if not output_markdown:
        valid = [r for r in results if r["is_valid"]]
        print(
            f"\nTotal tested: {len(results)}, Valid: {len(valid)}, Failed: {len(results) - len(valid)}"
        )


if __name__ == "__main__":
    main()
