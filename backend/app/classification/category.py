"""Category and breaking change classifier for Becon events.

Classifies into one of: 'release', 'deprecation', 'security', 'eol', 'industry'.
"""

from __future__ import annotations

import re

SECURITY_KEYWORDS_RE = re.compile(
    r"\b(?:cve-\d{4}-\d+|vulnerability|vulnerabilities|exploit|exploits|rce|"
    r"denial of service|dos|privilege escalation|arbitrary code execution|"
    r"malware|zero-day|breach|security advisory|security update|buffer overflow|spoofing)\b",
    re.IGNORECASE,
)

EOL_KEYWORDS_RE = re.compile(
    r"\b(?:end of life|end-of-life|\beol\b|sunsetting|sunset|deprecated and removed|"
    r"discontinued|decommissioned|retiring|out of support)\b",
    re.IGNORECASE,
)

DEPRECATION_KEYWORDS_RE = re.compile(
    r"\b(?:deprecation|deprecated|deprecating|obsolete|phasing out|planned removal|feature removal)\b",
    re.IGNORECASE,
)

RELEASE_KEYWORDS_RE = re.compile(
    r"\b(?:release|releases|released|announcing|v?\d+\.\d+(?:\.\d+)?|version \d+|"
    r"beta|alpha|release candidate|\brc\d*|launch|launched|stable release|changelog)\b",
    re.IGNORECASE,
)

BREAKING_KEYWORDS_RE = re.compile(
    r"\b(?:breaking change|breaking changes|incompatible|migration required|"
    r"backwards incompatible|breaking behavior|breaking updates?)\b",
    re.IGNORECASE,
)


def classify_event_category(
    title: str,
    text: str = "",
    source_type: str = "",
    source_slug: str = "",
) -> tuple[str, bool]:
    """Classifies event category and breaking status.

    Returns:
        (category, is_breaking)
        category in: 'release', 'deprecation', 'security', 'eol', 'industry'
    """
    combined = f"{title} {text}".lower()

    # 1. Breaking detection
    is_breaking = bool(BREAKING_KEYWORDS_RE.search(combined))

    # 2. Source type advisory or CVE in title -> always 'security'
    if (
        source_type.lower() == "advisory"
        or source_slug.lower() in ("cisa-kev", "nvd-cve", "ghsa-advisories")
        or "cve-" in title.lower()
    ):
        return "security", is_breaking

    # 3. Keyword rules in priority order: EOL -> Security -> Deprecation -> Release -> Industry
    if EOL_KEYWORDS_RE.search(combined):
        return "eol", True  # EOL is inherently breaking

    if SECURITY_KEYWORDS_RE.search(combined):
        return "security", is_breaking

    if DEPRECATION_KEYWORDS_RE.search(combined):
        return "deprecation", is_breaking

    if RELEASE_KEYWORDS_RE.search(title) or RELEASE_KEYWORDS_RE.search(combined):
        return "release", is_breaking

    return "industry", is_breaking
