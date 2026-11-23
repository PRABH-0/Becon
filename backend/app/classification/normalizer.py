"""Title normalization for Becon events.

Strips vendor prefixes/suffixes, tags, and blog boilerplate while keeping version numbers.
"""

from __future__ import annotations

import re

# Leading bracketed boilerplate tags: e.g. [ANN], [Announce], [Release], [Security], [RFC], [Update]
LEADING_TAG_RE = re.compile(
    r"^\s*\[(?:\s*(?:ANN|ANNOUNCE|ANNOUNCEMENT|RELEASE|SECURITY|UPDATE|ADVISORY|RFC|NEWS|ALERT)\s*)\]\s*[:\-–—]?\s*",
    re.IGNORECASE,
)

# Patterns like "Release v1.2.3 - Project" or "Release 1.2.3 of Project"
RELEASE_PATTERN_1 = re.compile(
    r"^\s*Release\s+v?(\d+\.\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?)\s*(?:[-–—:]|\bof\b)\s*([^|-]+?)\s*$",
    re.IGNORECASE,
)
RELEASE_PATTERN_2 = re.compile(
    r"^\s*Release\s+([^|-]+?)\s+v?(\d+\.\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?)\s*$",
    re.IGNORECASE,
)

# Common blog/vendor prefixes
LEADING_PREFIX_RE = re.compile(
    r"^\s*(?:Blog\s*[-–—|:]\s*[A-Za-z0-9_\s]+?[-–—|:]\s*|Company\s*[-–—|:]\s*[A-Za-z0-9_\s]+?[-–—|:]\s*|"
    r"Announcing\s+|Announcement:\s*|Release:\s*|New\s+Release:\s*|Updates?:\s*|What's\s+new\s+in\s+(?:the\s+)?)\s*",
    re.IGNORECASE,
)

# Common blog/vendor suffixes
TRAILING_VENDOR_SUFFIXES = [
    r"\s*[-–—|]\s*Blog\s*[-–—|]\s*Company\s*$",
    r"\s*[-–—|]\s*Google\s+Developers(?:\s+Blog)?$",
    r"\s*[-–—|]\s*Android\s+Developers(?:\'?\s+Blog)?$",
    r"\s*[-–—|]\s*TypeScript(?:\s+Blog)?$",
    r"\s*[-–—|]\s*Python\s+Insider(?:\s+Blog)?$",
    r"\s*[-–—|]\s*The\s+Go\s+Blog$",
    r"\s*[-–—|]\s*Go\s+Blog$",
    r"\s*[-–—|]\s*AWS\s+News\s+Blog$",
    r"\s*[-–—|]\s*AWS\s+Architecture\s+Blog$",
    r"\s*[-–—|]\s*AWS\s+Security\s+Blog$",
    r"\s*[-–—|]\s*Docker(?:\s+Blog)?$",
    r"\s*[-–—|]\s*React(?:\s+Blog)?$",
    r"\s*[-–—|]\s*Node\.js(?:\s+Blog)?$",
    r"\s*[-–—|]\s*The\s+Cloudflare\s+Blog$",
    r"\s*[-–—|]\s*Cloudflare(?:\s+Blog)?$",
    r"\s*[-–—|]\s*GitHub\s+Blog$",
    r"\s*[-–—|]\s*GitHub\s+Changelog$",
    r"\s*[-–—|]\s*Kubernetes(?:\s+Blog)?$",
    r"\s*[-–—|]\s*Microsoft(?:\s+Developer)?(?:\s+Blog)?$",
    r"\s*[-–—|]\s*devblogs\.microsoft\.com.*$",
    r"\s*[-–—|]\s*Hacker\s+News$",
    r"\s*[-–—|]\s*Lobste\.rs$",
    r"\s*[-–—|]\s*DevFest.*$",
    r"\s*[-–—|]\s*Blog\s*$",
    r"\s*[-–—|]\s*Company\s*$",
]
TRAILING_VENDOR_RE = re.compile("|".join(TRAILING_VENDOR_SUFFIXES), re.IGNORECASE)

BARE_VERSION_START_RE = re.compile(
    r"^v?\d+\.\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?(?:\b|$)",
    re.IGNORECASE,
)


def normalize_event_title(
    raw_title: str,
    source_name: str | None = None,
    primary_topic: str | None = None,
) -> str:
    """Normalize raw item title into a clean, canonical event title.

    - Strips leading bracket tags: e.g. [ANN], [Release]
    - Reorders "Release vX.Y - Project" -> "Project vX.Y"
    - Strips trailing vendor/blog branding: e.g. " - Google Developers Blog", " - TypeScript"
    - Strips boilerplate prefixes: e.g. "Announcing "
    - Preserves version numbers, CVE IDs, and essential project names.
    - If title starts with a bare version (v?X.Y...), prefixes it with primary topic or source name.
    """
    if not raw_title:
        return ""

    title = raw_title.strip()

    # 1. Strip leading bracket tags: [ANN], [Release], etc.
    title = LEADING_TAG_RE.sub("", title).strip()

    # 2. Check for "Release vX.Y - Project" BEFORE stripping trailing vendor suffix
    m1 = RELEASE_PATTERN_1.match(title)
    if m1:
        ver, proj = m1.group(1), m1.group(2).strip()
        title = f"{proj} v{ver}"
    else:
        m2 = RELEASE_PATTERN_2.match(title)
        if m2:
            proj, ver = m2.group(1).strip(), m2.group(2)
            title = f"{proj} v{ver}"

    # 3. Strip trailing vendor/blog suffixes (up to 2 passes for nested suffixes)
    for _ in range(2):
        cleaned = TRAILING_VENDOR_RE.sub("", title).strip()
        if cleaned:
            title = cleaned

    # 4. Strip boilerplate prefixes like "Announcing " or "What's new in "
    m_pre = LEADING_PREFIX_RE.match(title)
    if m_pre:
        rest = title[m_pre.end():].strip()
        if len(rest) >= 4:
            title = rest

    # 5. Clean whitespace and trim trailing separators
    title = re.sub(r"\s+", " ", title).strip(" -–—|:;,")

    if len(title) < 3:
        title = raw_title.strip()

    # 6. Prefix bare version titles (e.g. "v29.10.0" -> "Docker v29.10.0")
    if BARE_VERSION_START_RE.match(title):
        prefix = ""
        if primary_topic and primary_topic.strip():
            prefix = primary_topic.strip()
        elif source_name and source_name.strip():
            # Clean common generic descriptors like Releases, Blog, Updates, News
            cleaned = re.sub(
                r"\s+(?:Releases|Blog|Updates|Changelog|Advisories|Advisory|News)\b",
                "",
                source_name,
                flags=re.IGNORECASE,
            ).strip()
            prefix = cleaned if cleaned else source_name.strip()

        if prefix and not title.lower().startswith(prefix.lower()):
            title = f"{prefix} {title}"

    return title
