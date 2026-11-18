"""In-process sliding-window rate limiter and daily Gemini call quota guard.

Design note:
- Uses thread-safe in-memory sliding windows and UTC-day counters with zero external dependencies.
- Because state is per-process, deployments running multiple workers or replicas MUST migrate
  this backing store to a shared store (e.g., Redis) to enforce limits globally across instances.
- X-Forwarded-For is ONLY trusted when the direct socket peer IP is listed in TRUSTED_PROXIES
  (or '*' is explicitly configured); otherwise the socket peer address is used directly.
"""

import math
import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status

from app.config import settings


class GeminiQuotaExceededError(Exception):
    """Raised when a user or global daily Gemini call quota is exhausted."""

    def __init__(self, detail: str, retry_after: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.retry_after = max(1, int(retry_after))


def get_client_ip(request: Request) -> str:
    """Resolve client IP, honoring X-Forwarded-For ONLY behind a configured trusted proxy."""
    socket_ip = request.client.host if (request.client and request.client.host) else "unknown"
    trusted = settings.trusted_proxies_set
    if trusted and ("*" in trusted or socket_ip in trusted):
        xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
        if xff:
            first_ip = xff.split(",")[0].strip()
            if first_ip:
                return first_ip
    return socket_ip


def seconds_until_utc_midnight(now: datetime | None = None) -> int:
    """Return whole seconds remaining until the next UTC midnight (minimum 1)."""
    current = now or datetime.now(UTC)
    next_midnight = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    delta = (next_midnight - current).total_seconds()
    return max(1, math.ceil(delta))


class InProcessRateLimiter:
    """Thread-safe per-process sliding-window rate limiter + daily Gemini quota tracker."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, deque[float]] = defaultdict(deque)
        self._quota_day: str = datetime.now(UTC).strftime("%Y-%m-%d")
        self._global_gemini_count: int = 0
        self._all_guests_gemini_count: int = 0
        self._user_gemini_counts: dict[str, int] = defaultdict(int)

    def reset(self) -> None:
        """Clear all rate-limit windows and daily quota counters (for testing)."""
        with self._lock:
            self._windows.clear()
            self._quota_day = datetime.now(UTC).strftime("%Y-%m-%d")
            self._global_gemini_count = 0
            self._all_guests_gemini_count = 0
            self._user_gemini_counts.clear()

    def _roll_day_if_needed(self) -> None:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        if today != self._quota_day:
            self._quota_day = today
            self._global_gemini_count = 0
            self._all_guests_gemini_count = 0
            self._user_gemini_counts.clear()

    def check_sliding_window(self, bucket_key: str, limit: int, window_seconds: int = 60) -> None:
        """Enforce `limit` hits per `window_seconds` for `bucket_key`; raise 429 with Retry-After."""
        if not settings.RATE_LIMIT_ENABLED:
            return

        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            q = self._windows[bucket_key]
            while q and q[0] <= cutoff:
                q.popleft()

            if len(q) >= limit:
                retry_after = max(1, math.ceil(q[0] + window_seconds - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please retry later.",
                    headers={"Retry-After": str(retry_after)},
                )

            q.append(now)

    def _assert_quota_available_locked(self, user_key: str | None = None, is_guest: bool = False) -> None:
        self._roll_day_if_needed()

        if self._global_gemini_count >= settings.GEMINI_DAILY_CAP_GLOBAL:
            retry_after = seconds_until_utc_midnight()
            raise GeminiQuotaExceededError(
                detail="Global daily AI quota exceeded. Please try again tomorrow.",
                retry_after=retry_after,
            )

        if is_guest:
            if self._all_guests_gemini_count >= settings.GEMINI_DAILY_CAP_ALL_GUESTS:
                retry_after = seconds_until_utc_midnight()
                raise GeminiQuotaExceededError(
                    detail="Daily guest AI capacity has been reached. Create a free account to continue.",
                    retry_after=retry_after,
                )
            if user_key is not None and self._user_gemini_counts[user_key] >= settings.GEMINI_DAILY_CAP_GUEST:
                retry_after = seconds_until_utc_midnight()
                raise GeminiQuotaExceededError(
                    detail="Guest daily AI request quota reached. Create a free account for higher limits.",
                    retry_after=retry_after,
                )
        elif user_key is not None:
            if self._user_gemini_counts[user_key] >= settings.GEMINI_DAILY_CAP_PER_USER:
                retry_after = seconds_until_utc_midnight()
                raise GeminiQuotaExceededError(
                    detail="Your daily AI request quota has been reached. Please try again tomorrow.",
                    retry_after=retry_after,
                )

    def check_gemini_quota(self, user_key: str | None = None, is_guest: bool = False) -> None:
        """Pre-flight check that daily Gemini quota is available without incrementing counters."""
        if not settings.RATE_LIMIT_ENABLED:
            return
        with self._lock:
            self._assert_quota_available_locked(user_key=user_key, is_guest=is_guest)

    def record_gemini_usage(self, user_key: str | None = None, is_guest: bool = False) -> None:
        """Record one completed/reached Gemini logical request against daily caps."""
        if not settings.RATE_LIMIT_ENABLED:
            return
        with self._lock:
            self._roll_day_if_needed()
            if user_key is not None:
                self._user_gemini_counts[user_key] += 1
            if is_guest:
                self._all_guests_gemini_count += 1
            self._global_gemini_count += 1

    def consume_gemini_quota(self, user_key: str | None = None, is_guest: bool = False) -> None:
        """Enforce hard UTC-day per-user, guest-pool, and global Gemini call caps; raise GeminiQuotaExceededError."""
        if not settings.RATE_LIMIT_ENABLED:
            return

        with self._lock:
            self._assert_quota_available_locked(user_key=user_key, is_guest=is_guest)
            if user_key is not None:
                self._user_gemini_counts[user_key] += 1
            if is_guest:
                self._all_guests_gemini_count += 1
            self._global_gemini_count += 1


rate_limiter = InProcessRateLimiter()


def enforce_public_rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing per-IP rate limits on public/unauthenticated endpoints."""
    ip = get_client_ip(request)
    rate_limiter.check_sliding_window(
        bucket_key=f"public:{request.url.path}:{ip}",
        limit=settings.RATE_LIMIT_PUBLIC_PER_MIN,
        window_seconds=60,
    )


def enforce_auth_ai_rate_limit(user_id: int, scope: str = "ai", is_guest: bool = False) -> None:
    """Enforce per-user rate limit on authenticated AI-triggering endpoints (stricter for guests)."""
    limit = settings.GUEST_AI_PER_MIN if is_guest else settings.RATE_LIMIT_AUTH_AI_PER_MIN
    rate_limiter.check_sliding_window(
        bucket_key=f"auth_ai:{scope}:user:{user_id}",
        limit=limit,
        window_seconds=60,
    )
