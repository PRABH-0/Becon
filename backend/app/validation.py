"""Validation layer for Becon Action Cards.

Enforces:
1. Minimum source text length check (> ~200 chars).
2. Pydantic schema validation.
3. Entity extraction & source-grounding check:
   - Version numbers, CVE IDs, dates, and capitalized product names present in `what_happened`
     must appear in the raw source text (via normalized matching).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from app.schemas import BriefingCardContent

logger = logging.getLogger(__name__)

MIN_SOURCE_TEXT_LENGTH = 200

# Regex patterns for entity extraction
VERSION_RE = re.compile(r"\bv?(\d+\.\d+(?:\.\d+)*(?:-[a-zA-Z0-9.]+)?)\b", re.IGNORECASE)
CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.IGNORECASE)
DATE_RE = re.compile(
    r"\b(?:(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*(?:19|20)\d{2})?|(?:19|20)\d{2})\b",
    re.IGNORECASE,
)

# Common words, sentence starters, and non-product nouns to ignore when extracting capitalized product names
STOP_WORDS: set[str] = {
    "a", "about", "action", "advisory", "after", "against", "all", "almost", "also",
    "although", "always", "among", "an", "and", "announcement", "any", "apply", "are",
    "around", "as", "at", "avoid", "back", "be", "because", "been", "before", "being",
    "between", "both", "bug", "but", "by", "can", "could", "critical", "date", "day",
    "developer", "developers", "did", "do", "does", "during", "each", "engineer",
    "engineers", "even", "every", "feature", "features", "few", "first", "fix", "fixed",
    "fixes", "for", "from", "further", "furthermore", "get", "got", "had", "has", "have",
    "he", "her", "here", "high", "him", "his", "how", "however", "i", "if", "in", "into",
    "is", "issue", "issues", "it", "its", "just", "last", "latest", "learn", "like",
    "low", "made", "make", "many", "may", "medium", "me", "might", "month", "more",
    "moreover", "most", "my", "new", "next", "no", "nor", "not", "note", "notes",
    "now", "of", "off", "on", "once", "one", "only", "or", "other", "our", "out",
    "over", "overall", "own", "patch", "patches", "patched", "per", "prepare", "recent",
    "recently", "release", "releases", "released", "right", "same", "say", "second",
    "security", "see", "several", "she", "should", "since", "so", "some", "such",
    "team", "teams", "than", "that", "the", "their", "them", "then", "there", "these",
    "they", "this", "those", "through", "time", "to", "today", "tomorrow", "too",
    "under", "unless", "until", "up", "update", "updates", "updated", "upon", "us",
    "use", "user", "users", "using", "version", "versions", "very", "vulnerability",
    "vulnerabilities", "was", "we", "well", "were", "what", "when", "where", "which",
    "while", "who", "whom", "why", "will", "with", "within", "without", "would",
    "year", "yesterday", "yet", "you", "your",
    # Common English words that may be capitalized mid-sentence or in headings
    "analysis", "cost", "price", "report", "overview", "introduction", "progress",
    "summary", "details", "implementation", "support", "architecture", "system",
    "systems", "compiler", "runtime", "language", "service", "services", "guide",
    "upgrade", "code", "source", "exposure", "denial", "tools", "tooling", "work",
    "workflows", "performance", "memory", "speed", "post", "step", "steps",
    "unlike", "announcing", "introducing", "findings", "results", "study", "data",
    "model", "models", "capability", "capabilities", "session", "sessions", "rate",
    "rates", "comment", "comments", "ticket", "tickets", "bug", "bugs",
}

MONTH_MAP: dict[int, list[str]] = {
    1: ["january", "jan"],
    2: ["february", "feb"],
    3: ["march", "mar"],
    4: ["april", "apr"],
    5: ["may"],
    6: ["june", "jun"],
    7: ["july", "jul"],
    8: ["august", "aug"],
    9: ["september", "sep"],
    10: ["october", "oct"],
    11: ["november", "nov"],
    12: ["december", "dec"],
}


@dataclass
class ValidationResult:
    is_valid: bool
    status: str  # "passed" | "flagged"
    notes: dict[str, Any] | None = None


def is_source_text_sufficient(source_text: str | None) -> tuple[bool, str | None]:
    """Check if raw source text meets the minimum character threshold (> ~200 chars)."""
    if not source_text:
        return False, "Source text is empty or missing"
    cleaned = source_text.strip()
    if len(cleaned) < MIN_SOURCE_TEXT_LENGTH:
        return False, f"Source text too short ({len(cleaned)} chars < {MIN_SOURCE_TEXT_LENGTH})"
    return True, None


def normalize_string(text: str) -> str:
    """Normalize text by stripping non-alphanumeric characters and collapsing whitespace."""
    if not text:
        return ""
    lowered = text.lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", cleaned).strip()


def check_date_match(date_token: str, source_text: str) -> bool:
    """Verifies that an extracted date token matches what appears in the source text."""
    source_lower = source_text.lower()
    norm_source = normalize_string(source_text)
    norm_date = normalize_string(date_token)

    if norm_date in norm_source:
        return True

    # Try ISO YYYY-MM-DD parse
    iso_match = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", date_token)
    if iso_match:
        year = iso_match.group(1)
        month = int(iso_match.group(2))
        day = str(int(iso_match.group(3)))
        month_aliases = MONTH_MAP.get(month, [])
        has_year = year in source_lower
        has_month = any(m in source_lower for m in month_aliases) or f"{month:02d}" in source_lower
        has_day = day in source_lower
        return has_year and has_month and has_day

    # Standalone 4-digit year
    if re.match(r"^(19|20)\d{2}$", date_token):
        return date_token in source_lower

    return False


def extract_entities_from_bullets(bullets: list[str]) -> dict[str, list[str]]:
    """Extract version numbers, CVE IDs, dates, and capitalized product names from what_happened bullets."""
    versions: set[str] = set()
    cves: set[str] = set()
    dates: set[str] = set()
    products: set[str] = set()

    for bullet in bullets:
        if not bullet or not isinstance(bullet, str):
            continue

        # 1. Versions
        for v in VERSION_RE.findall(bullet):
            clean_v = v.strip().lstrip("vV")
            if clean_v and "." in clean_v:
                versions.add(clean_v)

        # 2. CVE IDs
        for cve in CVE_RE.findall(bullet):
            cves.add(cve.strip().upper())

        # 3. Dates
        for d in DATE_RE.findall(bullet):
            clean_d = d.strip()
            if clean_d:
                dates.add(clean_d)

        # 4. Capitalized product / tech names (e.g. Next.js, Node.js, Kubernetes, Docker, Postgres)
        # Rule: Ignore sentence-initial capitalized words (e.g. "Unlike", "Analysis", "Cost")
        # and common English words; keep mid-sentence proper nouns.
        sentences = re.split(r"(?<=[.!?])\s+", bullet.strip())
        for sentence in sentences:
            s_clean = sentence.lstrip("\"'“`-*• ")
            words = re.findall(r"\b[A-Za-z0-9._-]+\b", s_clean)
            for i, tok in enumerate(words):
                if i == 0:
                    # Ignore sentence-initial capitalized word
                    continue
                if not tok or not tok[0].isupper():
                    continue
                clean_tok = tok.strip("._-")
                if not clean_tok or clean_tok.isdigit():
                    continue
                lower_tok = clean_tok.lower()
                if lower_tok in STOP_WORDS:
                    continue
                if lower_tok.startswith("cve-"):
                    continue
                if lower_tok in [v.lower() for v in versions]:
                    continue
                products.add(clean_tok)

    return {
        "versions": sorted(versions),
        "cves": sorted(cves),
        "dates": sorted(dates),
        "products": sorted(products),
    }


def verify_entities_in_source(entities: dict[str, list[str]], source_text: str) -> tuple[bool, list[str]]:
    """Verify that every extracted entity from what_happened is grounded in the source text.

    Returns (is_valid, list_of_unsupported_entities).
    """
    unsupported: list[str] = []
    norm_source = normalize_string(source_text)

    # 1. Check CVE IDs
    for cve in entities.get("cves", []):
        norm_cve = normalize_string(cve)
        if norm_cve not in norm_source:
            unsupported.append(f"CVE: {cve}")

    # 2. Check Version numbers
    for ver in entities.get("versions", []):
        norm_ver = normalize_string(ver)
        if norm_ver not in norm_source:
            # Check major.minor fallback (e.g. 1.31 matching 1.31.0)
            parts = norm_ver.split()
            if len(parts) >= 2 and f"{parts[0]} {parts[1]}" in norm_source:
                continue
            unsupported.append(f"Version: {ver}")

    # 3. Check Dates
    for d in entities.get("dates", []):
        if not check_date_match(d, source_text):
            unsupported.append(f"Date: {d}")

    # 4. Check Capitalized product / project names
    for prod in entities.get("products", []):
        norm_prod = normalize_string(prod)
        if not norm_prod:
            continue
        # Check boundary match or substring in normalized source
        pattern = r"(?:\b|_)" + re.escape(norm_prod) + r"(?:\b|_)"
        if not re.search(pattern, norm_source) and norm_prod not in norm_source:
            unsupported.append(f"Product: {prod}")

    is_valid = len(unsupported) == 0
    return is_valid, unsupported


def validate_card_content(card_content: BriefingCardContent, source_text: str) -> ValidationResult:
    """Validates schema structure and checks that what_happened claims are grounded in source text."""
    # 1. Schema checks
    if not card_content.what_happened or not isinstance(card_content.what_happened, list):
        return ValidationResult(
            is_valid=False,
            status="flagged",
            notes={"reason": "invalid_schema", "error": "what_happened must be a non-empty list of strings"},
        )

    for idx, bullet in enumerate(card_content.what_happened):
        if not isinstance(bullet, str) or len(bullet.strip()) < 10:
            return ValidationResult(
                is_valid=False,
                status="flagged",
                notes={
                    "reason": "invalid_schema",
                    "error": f"what_happened bullet {idx} too short or not a string",
                },
            )

    if not card_content.why_it_matters or len(card_content.why_it_matters.strip()) < 15:
        return ValidationResult(
            is_valid=False,
            status="flagged",
            notes={"reason": "invalid_schema", "error": "why_it_matters must be at least 15 characters"},
        )

    if not card_content.how_it_affects_you or len(card_content.how_it_affects_you.strip()) < 15:
        return ValidationResult(
            is_valid=False,
            status="flagged",
            notes={"reason": "invalid_schema", "error": "how_it_affects_you must be at least 15 characters"},
        )

    if not card_content.what_to_do_next or card_content.what_to_do_next.action_type not in (
        "learn",
        "apply",
        "avoid",
        "prepare",
    ):
        return ValidationResult(
            is_valid=False,
            status="flagged",
            notes={
                "reason": "invalid_schema",
                "error": "what_to_do_next action_type must be in {learn, apply, avoid, prepare}",
            },
        )

    if not card_content.what_to_do_next.guidance or len(card_content.what_to_do_next.guidance.strip()) < 10:
        return ValidationResult(
            is_valid=False,
            status="flagged",
            notes={"reason": "invalid_schema", "error": "what_to_do_next guidance must be at least 10 characters"},
        )

    # 2. Entity grounding checks on what_happened
    entities = extract_entities_from_bullets(card_content.what_happened)
    is_grounded, unsupported = verify_entities_in_source(entities, source_text)

    if not is_grounded:
        logger.warning(
            "Card validation flagged hallucinated/unsupported entities in what_happened: %s",
            unsupported,
        )
        return ValidationResult(
            is_valid=False,
            status="flagged",
            notes={
                "reason": "entity_hallucination",
                "unsupported_entities": unsupported,
                "extracted_entities": entities,
            },
        )

    return ValidationResult(
        is_valid=True,
        status="passed",
        notes={"entity_check": "passed", "entities_verified": entities},
    )
