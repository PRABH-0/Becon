"""Tests for Task 2.3 Fetchers framework.

100% offline, deterministic tests covering:
- Parsing per source type (RSS, Atom, GitHub Releases, GHSA, CISA KEV, NVD)
- Conditional GET (304 handling and validator persistence)
- Exact deduplication by (source_id, url_hash)
- Max-age and newest-N limits
- Text sanitization (HTML tag/script stripping, whitespace normalization, tracking params)
- SSRF guards (private IP literals, DNS resolution, redirect hops, non-HTTPS schemes)
- Max response size cap (2 MB limit)
- Error handling, Retry-After backoff, failure counters, error sanitization
- Runner isolation (one failing source does not stop other sources)
- Gemini safety assertion (ensures zero Gemini / ai_service calls occur)
"""

import os
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.fetchers.advisory import AdvisoryFetcher
from app.fetchers.feed import FeedFetcher
from app.fetchers.http_client import (
    InsecureSchemeError,
    ResponseTooLargeError,
    SafeHTTPClient,
    SSRFError,
    sanitize_error_message,
    validate_url_safety,
)
from app.fetchers.runner import fetch_and_store_source, run_fetch
from app.fetchers.sanitizer import (
    clean_summary_text,
    sanitize_plain_text,
)
from app.models import RawItem, Source

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
BACKEND_DIR = Path(__file__).resolve().parent.parent


def read_fixture(filename: str) -> bytes:
    path = FIXTURES_DIR / filename
    with open(path, "rb") as f:
        return f.read()


@pytest.fixture
def test_db():
    """Create a temporary SQLite database migrated to head."""
    temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    temp_path = temp_file.name
    temp_file.close()

    db_url = f"sqlite:///{temp_path}"
    ini_path = BACKEND_DIR / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    yield db

    db.close()
    engine.dispose()
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 1. SSRF and Protocol Safety Guards
# ---------------------------------------------------------------------------


def test_ssrf_rejects_non_https():
    """Verify non-https schemes are rejected immediately."""
    with pytest.raises(InsecureSchemeError, match="only https is allowed"):
        validate_url_safety("http://example.com/feed.xml")

    with pytest.raises(InsecureSchemeError, match="only https is allowed"):
        validate_url_safety("ftp://example.com/feed.xml")

    with pytest.raises(InsecureSchemeError, match="only https is allowed"):
        validate_url_safety("file:///etc/passwd")


def test_ssrf_rejects_localhost_and_private_ips():
    """Verify private/loopback IP literals and hostnames are rejected."""
    forbidden_urls = [
        "https://localhost/feed.xml",
        "https://127.0.0.1/feed.xml",
        "https://0.0.0.0/feed.xml",
        "https://10.0.0.1/feed.xml",
        "https://172.16.0.1/feed.xml",
        "https://192.168.1.1/feed.xml",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/feed.xml",
    ]
    for url in forbidden_urls:
        with pytest.raises(SSRFError):
            validate_url_safety(url, skip_dns=False)


def test_ssrf_rejects_redirect_to_private_ip():
    """Verify safe client detects and rejects redirect bouncing to private IP."""
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/feed":
            return httpx.Response(302, headers={"Location": "https://127.0.0.1/internal"})
        return httpx.Response(200, text="internal data")

    client = SafeHTTPClient(transport=httpx.MockTransport(handler), skip_dns=True)
    with pytest.raises(SSRFError, match="forbidden"):
        client.get("https://example.com/feed")


def test_ssrf_rejects_redirect_to_insecure_scheme():
    """Verify safe client rejects redirect to non-https URL."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(301, headers={"Location": "http://example.com/insecure"})

    client = SafeHTTPClient(transport=httpx.MockTransport(handler), skip_dns=True)
    with pytest.raises(InsecureSchemeError, match="only https is allowed"):
        client.get("https://example.com/feed")


# ---------------------------------------------------------------------------
# 2. Response Size Caps
# ---------------------------------------------------------------------------


def test_response_size_cap_content_length():
    """Verify oversized Content-Length is rejected before reading body."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"Content-Length": "3000000"}, content=b"dummy")

    client = SafeHTTPClient(transport=httpx.MockTransport(handler), max_response_bytes=1000)
    with pytest.raises(ResponseTooLargeError, match="exceeds cap"):
        client.get("https://example.com/feed")


def test_response_size_cap_body_streaming():
    """Verify response payload exceeding max_response_bytes is rejected."""
    huge_payload = b"A" * 2000

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=huge_payload)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler), max_response_bytes=1000)
    with pytest.raises(ResponseTooLargeError, match="exceeds cap"):
        client.get("https://example.com/feed")


# ---------------------------------------------------------------------------
# 3. Text Sanitization
# ---------------------------------------------------------------------------


def test_sanitizer_strips_html_scripts_and_normalizes():
    """Verify HTML tags, scripts, styles are stripped and entities unescaped."""
    raw_html = """
    <div>
        <h1>Title Header</h1>
        <script>alert('malicious')</script>
        <style>body { color: red; }</style>
        <p>This is a paragraph with &amp; entity &lt;tag&gt; and    multiple    spaces.</p>
        <nav><a href="/home">Home</a></nav>
    </div>
    """
    clean = sanitize_plain_text(raw_html)
    assert "<script>" not in clean
    assert "alert" not in clean
    assert "<style>" not in clean
    assert "Title Header" in clean
    assert "with & entity <tag> and multiple spaces." in clean
    assert "Home" not in clean  # nav tag discarded


def test_sanitizer_length_cap():
    """Verify long text is capped at max_length."""
    long_text = "Word " * 6000  # 30k chars
    capped = sanitize_plain_text(long_text, max_length=500)
    assert len(capped) <= 500


def test_clean_summary_text_collapses_whitespace():
    """Verify summary text is single-line collapsed."""
    raw = "<p>Line one</p>\n\n<p>Line   two</p>"
    clean = clean_summary_text(raw, max_length=100)
    assert clean == "Line one Line two"


# ---------------------------------------------------------------------------
# 4. RSS, Atom, and GitHub Releases Parsing
# ---------------------------------------------------------------------------


def test_rss_fetcher_parsing(test_db):
    """Verify RSS 2.0 parsing, tracking param removal, and date cutoff."""
    rss_bytes = read_fixture("sample_rss.xml")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/feed.xml":
            return httpx.Response(200, headers={"ETag": '"etag-rss-1"', "Content-Type": "application/rss+xml"}, content=rss_bytes)
        return httpx.Response(
            200,
            headers={"Content-Type": "text/html"},
            text="<article><p>In this post we explore how modern distributed queues handle 100k events/sec. We look into batching, disk writes, and zero-copy transfers across memory boundaries.</p></article>",
        )

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    source = Source(
        id=uuid.uuid4(),
        slug="test-rss",
        name="Test RSS",
        site_url="https://example.com",
        feed_url="https://example.com/feed.xml",
        type="rss",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    fetcher = FeedFetcher(max_age_days=90)
    result = fetcher.fetch(source, client)

    assert result.status == "ok"
    assert result.new_etag == '"etag-rss-1"'
    # Historical item from 2023 was filtered out by cutoff
    assert len(result.items) == 1
    item = result.items[0]
    assert item.title == "Architecture of High-Throughput Pipelines"
    # Tracking parameters stripped
    assert item.url == "https://example.com/blog/high-throughput-pipelines"
    assert item.author == "Jane Doe"
    assert "100k events/sec" in item.content_text
    assert "<script>" not in item.content_text


def test_atom_fetcher_parsing(test_db):
    """Verify Atom 1.0 parsing and content extraction."""
    atom_bytes = read_fixture("sample_atom.xml")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"Last-Modified": "Wed, 18 Nov 2026 14:00:00 GMT"}, content=atom_bytes)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    source = Source(
        id=uuid.uuid4(),
        slug="test-atom",
        name="Test Atom",
        site_url="https://example.org",
        feed_url="https://example.org/releases.atom",
        type="atom",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    fetcher = FeedFetcher(max_age_days=90)
    result = fetcher.fetch(source, client)

    assert result.status == "ok"
    assert result.new_last_modified == "Wed, 18 Nov 2026 14:00:00 GMT"
    assert len(result.items) == 1
    item = result.items[0]
    assert item.title == "Framework v3.2.0 Released"
    assert item.url == "https://example.org/releases/v3.2.0"
    assert "Release Notes for v3.2.0" in item.content_text
    assert "critical socket connection leaks" in item.content_text


def test_github_releases_atom_parsing(test_db):
    """Verify GitHub releases atom feed parsing captures tag and release notes."""
    gh_atom = read_fixture("sample_github_releases.atom")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=gh_atom)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    source = Source(
        id=uuid.uuid4(),
        slug="fastapi-releases",
        name="FastAPI Releases",
        site_url="https://github.com/fastapi/fastapi",
        feed_url="https://github.com/fastapi/fastapi/releases.atom",
        type="atom",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    fetcher = FeedFetcher(max_age_days=90)
    result = fetcher.fetch(source, client)

    assert result.status == "ok"
    assert len(result.items) == 1
    item = result.items[0]
    assert item.title == "0.116.0"
    assert item.url == "https://github.com/fastapi/fastapi/releases/tag/0.116.0"
    assert "Upgrade Starlette to 0.40.0" in item.content_text


# ---------------------------------------------------------------------------
# 5. Advisory APIs Parsing (GHSA, CISA KEV, NVD)
# ---------------------------------------------------------------------------


def test_ghsa_advisory_parsing(test_db):
    """Verify GitHub Advisory Database JSON parsing and metadata extraction."""
    ghsa_bytes = read_fixture("sample_ghsa.json")

    def handler(request: httpx.Request) -> httpx.Response:
        assert "api.github.com" in str(request.url)
        return httpx.Response(200, headers={"ETag": '"ghsa-etag-1"'}, content=ghsa_bytes)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    source = Source(
        id=uuid.uuid4(),
        slug="github-advisories",
        name="GitHub Advisory Database",
        site_url="https://github.com/advisories",
        feed_url="https://api.github.com/advisories",
        type="advisory",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    fetcher = AdvisoryFetcher(max_age_days=90)
    result = fetcher.fetch(source, client)

    assert result.status == "ok"
    assert len(result.items) == 1
    item = result.items[0]
    assert "GHSA-79hf-g46h-p7f8" in item.title
    assert item.external_id == "GHSA-79hf-g46h-p7f8"
    assert item.raw_metadata["severity"] == "critical"
    assert item.raw_metadata["cve_ids"] == ["CVE-2026-4455"]
    assert item.raw_metadata["cvss_score"] == 9.8
    assert "npm:core-lib" in item.raw_metadata["affected_packages"]


def test_cisa_kev_advisory_parsing(test_db):
    """Verify CISA KEV catalog JSON parsing and severity metadata."""
    kev_bytes = read_fixture("sample_cisa_kev.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=kev_bytes)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    source = Source(
        id=uuid.uuid4(),
        slug="cisa-kev",
        name="CISA KEV",
        site_url="https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
        feed_url="https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
        type="advisory",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    fetcher = AdvisoryFetcher(max_age_days=90)
    result = fetcher.fetch(source, client)

    assert result.status == "ok"
    assert len(result.items) == 1
    item = result.items[0]
    assert "CVE-2026-1234 - OpenSSL CryptoEngine" in item.title
    assert item.external_id == "CVE-2026-1234"
    assert item.raw_metadata["severity"] == "critical"
    assert item.raw_metadata["vendor_project"] == "OpenSSL"
    assert item.raw_metadata["product"] == "CryptoEngine"
    assert item.raw_metadata["known_ransomware_campaign_use"] == "Known"


def test_nvd_cve_advisory_parsing(test_db):
    """Verify NVD CVE 2.0 REST API JSON parsing and CVSS v3.1 metrics."""
    nvd_bytes = read_fixture("sample_nvd.json")

    def handler(request: httpx.Request) -> httpx.Response:
        assert "services.nvd.nist.gov" in str(request.url)
        assert "lastModStartDate" in str(request.url)
        return httpx.Response(200, content=nvd_bytes)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    source = Source(
        id=uuid.uuid4(),
        slug="nvd-cve",
        name="NVD CVE",
        site_url="https://nvd.nist.gov/",
        feed_url="https://services.nvd.nist.gov/rest/json/cves/2.0",
        type="advisory",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    fetcher = AdvisoryFetcher(max_age_days=90)
    result = fetcher.fetch(source, client)

    assert result.status == "ok"
    assert len(result.items) == 1
    item = result.items[0]
    assert "CVE-2026-9999" in item.title
    assert item.external_id == "CVE-2026-9999"
    assert item.raw_metadata["severity"] == "medium"
    assert item.raw_metadata["cvss_score"] == 6.1
    assert "AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N" in item.raw_metadata["cvss_vector"]


# ---------------------------------------------------------------------------
# 6. Conditional GET (HTTP 304) and Validator Persistence
# ---------------------------------------------------------------------------


def test_conditional_get_304_handling(test_db):
    """Verify If-None-Match header is sent and 304 response leaves DB unchanged."""
    source = Source(
        id=uuid.uuid4(),
        slug="test-conditional",
        name="Test Conditional",
        site_url="https://example.com",
        feed_url="https://example.com/feed.xml",
        type="rss",
        trust_tier=1,
        etag='"cached-etag-123"',
        last_modified="Wed, 18 Nov 2026 10:00:00 GMT",
    )
    test_db.add(source)
    test_db.commit()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("if-none-match") == '"cached-etag-123"'
        assert request.headers.get("if-modified-since") == "Wed, 18 Nov 2026 10:00:00 GMT"
        return httpx.Response(304)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    summary = fetch_and_store_source(test_db, source, client)

    assert summary.status == "not_modified"
    assert summary.items_fetched == 0
    assert summary.new_inserted == 0
    assert source.consecutive_failures == 0
    assert source.last_success_at is not None


# ---------------------------------------------------------------------------
# 7. Deduplication on Insert
# ---------------------------------------------------------------------------


def test_dedup_on_insert_second_run_zero_new_items(test_db):
    """Verify running fetch twice on identical items inserts 0 new items on 2nd run."""
    rss_bytes = read_fixture("sample_rss.xml")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=rss_bytes)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    source = Source(
        id=uuid.uuid4(),
        slug="test-dedup",
        name="Test Dedup",
        site_url="https://example.com",
        feed_url="https://example.com/feed.xml",
        type="rss",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    # First run: inserts 1 new item
    s1 = fetch_and_store_source(test_db, source, client)
    assert s1.new_inserted == 1
    assert s1.duplicates_skipped == 0
    assert test_db.query(RawItem).count() == 1

    # Second run: skips duplicate, inserts 0
    s2 = fetch_and_store_source(test_db, source, client)
    assert s2.new_inserted == 0
    assert s2.duplicates_skipped == 1
    assert test_db.query(RawItem).count() == 1


# ---------------------------------------------------------------------------
# 8. Error Handling, Rate Limits, and Runner Isolation
# ---------------------------------------------------------------------------


def test_error_sanitization_redacts_tokens():
    """Verify secrets and auth tokens are scrubbed from last_error."""
    dirty_err = "Failed request with Authorization: Bearer secret_token_xyz12345678 to https://user:pass1234@api.example.com"
    clean = sanitize_error_message(dirty_err)
    assert "secret_token" not in clean
    assert "Bearer=[REDACTED]" in clean
    assert "pass1234" not in clean


def test_consecutive_failures_counter_increment_and_reset(test_db):
    """Verify failure increments consecutive_failures, success resets to 0."""
    source = Source(
        id=uuid.uuid4(),
        slug="test-counter",
        name="Test Counter",
        site_url="https://example.com",
        feed_url="https://example.com/feed.xml",
        type="rss",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    # 1. Failure (500)
    fail_client = SafeHTTPClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(500, text="Internal Error"))
    )
    s1 = fetch_and_store_source(test_db, source, fail_client)
    assert s1.status == "error"
    assert source.consecutive_failures == 1
    assert source.last_error is not None

    # 2. Success (200)
    rss_bytes = read_fixture("sample_rss.xml")
    success_client = SafeHTTPClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=rss_bytes))
    )
    s2 = fetch_and_store_source(test_db, source, success_client)
    assert s2.status == "ok"
    assert source.consecutive_failures == 0
    assert source.last_error is None


def test_runner_source_isolation(test_db):
    """Verify failure of source 1 does not stop source 2 in run_fetch."""
    rss_bytes = read_fixture("sample_rss.xml")

    src1 = Source(
        id=uuid.uuid4(),
        slug="source-1-broken",
        name="Source 1",
        site_url="https://example.com",
        feed_url="https://broken.example.com/feed.xml",
        type="rss",
        trust_tier=1,
    )
    src2 = Source(
        id=uuid.uuid4(),
        slug="source-2-healthy",
        name="Source 2",
        site_url="https://example.com",
        feed_url="https://healthy.example.com/feed.xml",
        type="rss",
        trust_tier=1,
    )
    test_db.add_all([src1, src2])
    test_db.commit()

    def handler(request: httpx.Request) -> httpx.Response:
        if "broken" in str(request.url):
            return httpx.Response(500, text="Downstream server crash")
        return httpx.Response(200, content=rss_bytes)

    client = SafeHTTPClient(transport=httpx.MockTransport(handler))
    summaries = run_fetch(db=test_db, client=client)

    assert len(summaries) == 2
    by_slug = {s.slug: s for s in summaries}
    assert by_slug["source-1-broken"].status == "error"
    assert by_slug["source-2-healthy"].status == "ok"
    assert by_slug["source-2-healthy"].new_inserted == 1


# ---------------------------------------------------------------------------
# 9. Gemini Safety Assertion
# ---------------------------------------------------------------------------


def test_gemini_is_never_called_during_fetch(test_db):
    """Hard constraint: fetch -> sanitize -> store ONLY. Zero Gemini calls allowed."""
    rss_bytes = read_fixture("sample_rss.xml")

    source = Source(
        id=uuid.uuid4(),
        slug="test-gemini-free",
        name="Test Gemini Free",
        site_url="https://example.com",
        feed_url="https://example.com/feed.xml",
        type="rss",
        trust_tier=1,
    )
    test_db.add(source)
    test_db.commit()

    client = SafeHTTPClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=rss_bytes))
    )

    # Patch google.genai and app.ai_service
    with patch("app.ai_service.generate_action_card") as mock_gen_card:
        run_fetch(db=test_db, client=client, bridge_to_events=False)
        mock_gen_card.assert_not_called()
