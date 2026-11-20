"""Severity scoring (0-100) for Becon events.

Factors:
1. Advisory CVSS score or CISA KEV flag (KEV is treated as a fixed high value, not CVSS).
2. Category base score (EOL, Deprecation, Release, Industry).
3. Breaking changes / EOL / RCE keywords (+15 points).
4. Focus topic match bonus (+10 points).
5. Recency decay (uses NVD modified date if present, published_at otherwise).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime


def calculate_severity_score(
    category: str,
    is_breaking: bool,
    raw_metadata: dict | None = None,
    source_slug: str = "",
    published_at: datetime | None = None,
    matched_topics_count: int = 0,
    text: str = "",
) -> int:
    """Computes an integer severity score between 0 and 100."""
    meta = raw_metadata or {}
    source_kind = meta.get("source_kind", "").lower()
    slug_lower = (source_slug or "").lower()

    # 1. Base Score Calculation
    is_kev = (
        slug_lower == "cisa-kev"
        or source_kind == "cisa_kev"
        or meta.get("cisa_kev") is True
        or "cisa_kev" in meta
    )

    if is_kev:
        # CISA KEV: Known active exploitation in the wild -> fixed high value
        base_score = 85.0
    elif category == "security" or "advisory" in slug_lower or source_kind in ("nvd_cve", "ghsa"):
        # Check CVSS score in metadata
        cvss = meta.get("cvss_score")
        if cvss is None:
            cvss = meta.get("cvss")
        if isinstance(cvss, (int, float)) and cvss > 0:
            # Scale 0.0 - 10.0 to 0 - 80 base
            base_score = float(cvss) * 8.0
        else:
            # Fallback to string severity levels
            sev_str = str(meta.get("severity", "")).lower()
            if "crit" in sev_str:
                base_score = 80.0
            elif "high" in sev_str:
                base_score = 65.0
            elif "med" in sev_str:
                base_score = 45.0
            elif "low" in sev_str:
                base_score = 25.0
            else:
                base_score = 60.0
    elif category == "eol":
        base_score = 55.0
    elif category == "deprecation":
        base_score = 45.0
    elif category == "release":
        base_score = 35.0
    else:  # industry / content
        base_score = 25.0

    score = base_score

    # 2. Breaking Changes / High-Impact Keywords Bonus
    if is_breaking or category == "eol":
        score += 15.0

    # RCE / Unauthenticated / Zero-day bonus for security events
    if category == "security" and re.search(r"\b(?:rce|zero-day|unauthenticated|arbitrary code execution)\b", text, re.IGNORECASE):
        score += 10.0

    # Major version release bonus (e.g. v2.0, 7.0, v1.0)
    if category == "release" and re.search(r"\bv?[1-9]\.0(?:\.0)?\b", text, re.IGNORECASE):
        score += 10.0

    # 3. Focus Topic Match Bonus
    if matched_topics_count > 0:
        score += 10.0

    # 4. Recency Decay
    # Determine effective date (NVD uses 'last_modified' if available)
    effective_dt = None
    if source_kind == "nvd_cve" or slug_lower == "nvd-cve":
        last_mod_str = meta.get("last_modified") or meta.get("modified")
        if last_mod_str:
            try:
                effective_dt = datetime.fromisoformat(last_mod_str.replace("Z", "+00:00"))
            except Exception:
                effective_dt = None

    if not effective_dt:
        effective_dt = published_at

    now = datetime.now(UTC)
    if effective_dt:
        # Ensure timezone-aware comparison
        if effective_dt.tzinfo is None:
            effective_dt = effective_dt.replace(tzinfo=UTC)
        age_days = (now - effective_dt).days
        if age_days < 0:
            age_days = 0

        if age_days <= 7:
            decay = 0.0
        elif age_days <= 30:
            decay = -5.0
        elif age_days <= 90:
            decay = -15.0
        elif age_days <= 365:
            decay = -30.0
        else:
            decay = -45.0
    else:
        decay = -10.0

    score += decay

    # 5. Clamp to [0, 100] integer
    final_score = int(round(score))
    return max(0, min(100, final_score))
