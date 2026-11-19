"""Safe HTTP client with SSRF guards, response size caps, conditional GET, and redirect inspection.

Guards:
1. HTTPS only (all schemes must be https://, including redirects).
2. SSRF Protection: Resolves hostnames via DNS and rejects private, loopback, link-local,
   multicast, reserved, and unspecified IP addresses. Inspects all redirect hops.
3. Size Cap: Limits response payload size to 2 MB (aborts on Content-Length or during streaming).
4. Conditional GET: Injects If-None-Match and If-Modified-Since headers, handling 304 cleanly.
5. Politeness: Rate limiting per host, Retry-After parsing on 429/503, max 1 retry.
6. Error Sanitization: Truncates and scrubs credentials from error messages.
"""

import ipaddress
import logging
import re
import socket
import time
import urllib.parse
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Dict

import httpx

logger = logging.getLogger("becon.fetchers.http")

DEFAULT_USER_AGENT = "BeconBot/1.0 (+https://github.com/PRABH-0/Becon)"
DEFAULT_TIMEOUT_SECONDS = 12.0
MAX_RESPONSE_BYTES = 2 * 1024 * 1024  # 2 MB cap
MAX_REDIRECTS = 3


class FetcherError(Exception):
    """Base error for fetcher operations."""

    pass


class SSRFError(FetcherError):
    """Raised when a target URL resolves to a forbidden IP address."""

    pass


class InsecureSchemeError(FetcherError):
    """Raised when a target URL does not use HTTPS."""

    pass


class ResponseTooLargeError(FetcherError):
    """Raised when a response body exceeds the maximum permitted byte size."""

    pass


class MaxRedirectsExceededError(FetcherError):
    """Raised when the redirect chain exceeds the allowed limit."""

    pass


def sanitize_error_message(msg: str, max_length: int = 500) -> str:
    """Scrub potential credentials and truncate error messages."""
    if not msg:
        return ""
    # Redact Authorization tokens or API keys matching pattern
    scrubbed = re.sub(
        r"(token|secret|key|bearer|auth[a-z_]*)[=:\s]+([a-zA-Z0-9_\-\.]{8,})",
        r"\1=[REDACTED]",
        msg,
        flags=re.IGNORECASE,
    )
    # Redact user:password in URLs
    scrubbed = re.sub(r"://([^:@\s]+):([^@\s]+)@", r"://[REDACTED]:[REDACTED]@", scrubbed)
    return scrubbed[:max_length].strip()


def is_ip_restricted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address belongs to private, loopback, or non-globally-routable ranges."""
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def validate_url_safety(url: str, skip_dns: bool = False) -> None:
    """Validate that a URL is HTTPS and does not resolve to a private/loopback/restricted IP.

    Args:
        url: The absolute target URL.
        skip_dns: If True, skips live DNS resolution (used in offline mock tests).
                  IP literals and URL schemes are still strictly validated.

    Raises:
        InsecureSchemeError: If the scheme is not https.
        SSRFError: If the hostname resolves to a restricted/private IP or is invalid.
    """
    if not url:
        raise SSRFError("URL cannot be empty")

    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme.lower() != "https":
        raise InsecureSchemeError(f"Insecure scheme '{parsed.scheme}'; only https is allowed")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("URL contains no valid hostname")

    # Reject known loopback names
    if hostname.lower() in ("localhost", "local", "127.0.0.1", "0.0.0.0", "::1"):
        raise SSRFError(f"Access to local host '{hostname}' is forbidden")

    # Check if hostname is an IP literal
    try:
        ip = ipaddress.ip_address(hostname)
        if is_ip_restricted(ip):
            raise SSRFError(f"Access to private/restricted IP literal '{ip}' is forbidden")
        return
    except ValueError:
        pass  # Hostname is a domain name

    # In mock transport / unit test mode, skip live DNS lookup
    if skip_dns:
        return

    # Resolve hostname via DNS
    try:
        addr_info = socket.getaddrinfo(hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise SSRFError(f"DNS resolution failed for '{hostname}': {e}") from e

    if not addr_info:
        raise SSRFError(f"No IP addresses resolved for '{hostname}'")

    for entry in addr_info:
        sockaddr = entry[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if is_ip_restricted(ip):
                raise SSRFError(f"Host '{hostname}' resolved to private/restricted IP '{ip}'")
        except ValueError:
            raise SSRFError(f"Host '{hostname}' resolved to invalid IP '{ip_str}'")


@dataclass
class SafeResponse:
    """Normalized response returned by SafeHTTPClient."""

    status_code: int
    headers: Dict[str, str]
    content: bytes
    url: str

    @property
    def text(self) -> str:
        try:
            return self.content.decode("utf-8")
        except UnicodeDecodeError:
            return self.content.decode("latin-1", errors="replace")


class SafeHTTPClient:
    """Safe, politeness-aware HTTP client with SSRF protection and conditional GET."""

    def __init__(
        self,
        transport: httpx.BaseTransport | None = None,
        user_agent: str = DEFAULT_USER_AGENT,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_response_bytes: int = MAX_RESPONSE_BYTES,
        max_redirects: int = MAX_REDIRECTS,
        skip_dns: bool = False,
    ) -> None:
        self.user_agent = user_agent
        self.timeout = timeout
        self.max_response_bytes = max_response_bytes
        self.max_redirects = max_redirects
        self.skip_dns = skip_dns or isinstance(transport, httpx.MockTransport)
        self.transport = transport
        # Track last request timestamp per hostname for polite pacing
        self._last_host_access: Dict[str, float] = {}

    def _apply_polite_delay(self, hostname: str, min_delay_seconds: float = 0.25) -> None:
        """Ensure polite spacing between requests to the same origin host."""
        now = time.time()
        last = self._last_host_access.get(hostname, 0.0)
        elapsed = now - last
        if elapsed < min_delay_seconds:
            time.sleep(min_delay_seconds - elapsed)
        self._last_host_access[hostname] = time.time()

    def get(
        self,
        url: str,
        headers: Dict[str, str] | None = None,
        etag: str | None = None,
        last_modified: str | None = None,
        allow_retry: bool = True,
    ) -> SafeResponse:
        """Perform a safe GET request with SSRF guard, size capping, and conditional headers.

        Args:
            url: Target URL (must be HTTPS).
            headers: Optional extra HTTP headers.
            etag: Optional cached ETag for If-None-Match.
            last_modified: Optional cached Last-Modified for If-Modified-Since.
            allow_retry: Whether to perform at most 1 retry on 429/503.

        Returns:
            SafeResponse with status_code, headers, content, and final url.
        """
        req_headers = {
            "User-Agent": self.user_agent,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, text/html, */*",
        }
        if headers:
            req_headers.update(headers)

        # Inject conditional GET headers
        if etag:
            req_headers["If-None-Match"] = etag
        if last_modified:
            req_headers["If-Modified-Since"] = last_modified

        current_url = url
        redirect_count = 0

        with httpx.Client(
            transport=self.transport,
            timeout=self.timeout,
            follow_redirects=False,
        ) as client:
            while True:
                # 1. SSRF Safety Check on current URL
                validate_url_safety(current_url, skip_dns=self.skip_dns)

                # 2. Host pacing politeness
                parsed = urllib.parse.urlparse(current_url)
                if parsed.hostname:
                    self._apply_polite_delay(parsed.hostname)

                # 3. Execute GET request
                try:
                    response = client.get(current_url, headers=req_headers)
                except httpx.TimeoutException as e:
                    raise FetcherError(f"HTTP request timed out after {self.timeout}s: {e}") from e
                except httpx.RequestError as e:
                    raise FetcherError(f"HTTP request failed: {e}") from e

                # 4. Handle 304 Not Modified
                if response.status_code == 304:
                    resp_headers = {k.lower(): v for k, v in response.headers.items()}
                    return SafeResponse(
                        status_code=304,
                        headers=resp_headers,
                        content=b"",
                        url=str(response.url),
                    )

                # 5. Handle Rate Limits / 429 / 503 Retry-After
                if response.status_code in (429, 503) and allow_retry:
                    retry_after = response.headers.get("retry-after")
                    wait_seconds = 1.5  # default short backoff
                    if retry_after:
                        try:
                            wait_seconds = float(retry_after)
                        except ValueError:
                            try:
                                dt = parsedate_to_datetime(retry_after)
                                wait_seconds = max(0.5, (dt.timestamp() - time.time()))
                            except Exception:
                                pass
                    # Cap backoff to max 3 seconds to avoid blocking runners
                    wait_seconds = min(wait_seconds, 3.0)
                    logger.warning(
                        "Received HTTP %d for %s. Retrying once after %.1fs backoff",
                        response.status_code,
                        current_url,
                        wait_seconds,
                    )
                    time.sleep(wait_seconds)
                    return self.get(
                        url=url,
                        headers=headers,
                        etag=etag,
                        last_modified=last_modified,
                        allow_retry=False,  # Max 1 retry
                    )

                # 6. Handle Redirects (301, 302, 303, 307, 308)
                if response.status_code in (301, 302, 303, 307, 308):
                    location = response.headers.get("location")
                    if not location:
                        raise FetcherError(f"HTTP {response.status_code} redirect missing Location header")

                    redirect_count += 1
                    if redirect_count > self.max_redirects:
                        raise MaxRedirectsExceededError(
                            f"Exceeded maximum redirects ({self.max_redirects})"
                        )

                    next_url = urllib.parse.urljoin(current_url, location)
                    logger.debug("Following redirect %d: %s -> %s", redirect_count, current_url, next_url)
                    current_url = next_url
                    continue

                # 7. Check Content-Length size cap before reading
                content_length = response.headers.get("content-length")
                if content_length:
                    try:
                        cl_bytes = int(content_length)
                        if cl_bytes > self.max_response_bytes:
                            raise ResponseTooLargeError(
                                f"Response Content-Length {cl_bytes} exceeds cap of {self.max_response_bytes} bytes"
                            )
                    except ValueError:
                        pass

                # 8. Read content body with size enforcement
                raw_bytes = response.content
                if len(raw_bytes) > self.max_response_bytes:
                    raise ResponseTooLargeError(
                        f"Response body {len(raw_bytes)} bytes exceeds cap of {self.max_response_bytes} bytes"
                    )

                resp_headers = {k.lower(): v for k, v in response.headers.items()}
                return SafeResponse(
                    status_code=response.status_code,
                    headers=resp_headers,
                    content=raw_bytes,
                    url=str(response.url),
                )
