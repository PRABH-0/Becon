from app.schemas import ActionGuidance, BriefingCardContent
from app.validation import (
    is_commit_log_only,
    is_source_text_sufficient,
    validate_card_content,
)

SAMPLE_COMMIT_LOG = """
Core Changes
* switchyard: name gone workers by token, and test the worker events and route table: #102168
* switchyard: no guessed Content-Type after 103 Early Hints: #102034
* switchyard: run Go code on at most 4 threads: #101901
* Link Node crypto prerender errors to the crypto error page: #102252
* Fix fast setImmediate running before microtasks queued by nextTick: #102237
* Turbopack: diff server HMR pulls against a Rust-owned loaded-module set: #102016
* Fix webpack runtime CSS ordering before first app router commit: #102027
Credits
Huge thanks to @contributor1, @contributor2 for helping!
"""

SAMPLE_PROSE_ARTICLE = """
The PostgreSQL Global Development Group today announced the release of PostgreSQL 19, the latest version of the open source database.
Mission-critical usage of PostgreSQL continues to rise rapidly, and PostgreSQL 19 responds to this by simplifying both administration and development for workloads at scale.
This release introduces the REPACK CONCURRENTLY command so database administrators can optimize bloated tables for their current workload without disruption to ongoing production operations.
Additionally, PostgreSQL 19 gives query engineers better control over query plan stability with the new pg_plan_advice extension.
"""


def test_is_source_text_sufficient():
    assert not is_source_text_sufficient("")[0]
    assert not is_source_text_sufficient("Short text under two hundred chars.")[0]
    long_text = "A" * 250
    assert is_source_text_sufficient(long_text)[0]


def test_is_commit_log_only_detection():
    # Commit log with PR links and bullet items
    assert is_commit_log_only(SAMPLE_COMMIT_LOG) is True

    # Real editorial prose article
    assert is_commit_log_only(SAMPLE_PROSE_ARTICLE) is False


def test_validator_rejects_generic_filler():
    filler_card = BriefingCardContent(
        what_happened=["PostgreSQL 19 announced new concurrency features."],
        why_it_matters="Improves database administration at scale.",
        how_it_affects_you="As a Professional, tracking updates in PostgreSQL 19 enables you to optimize existing pipelines, reduce architectural friction, and apply modern best practices.",
        what_to_do_next=ActionGuidance(
            action_type="apply",
            guidance="Test REPACK CONCURRENTLY in staging.",
        ),
    )

    result = validate_card_content(filler_card, SAMPLE_PROSE_ARTICLE)
    assert result.is_valid is False
    assert result.status == "flagged"
    assert result.notes is not None
    assert result.notes.get("reason") == "generic_filler"


def test_validator_marks_commit_log_unvalidated():
    valid_card = BriefingCardContent(
        what_happened=["switchyard: run Go code on at most 4 threads."],
        why_it_matters="Controls concurrency in the runtime engine.",
        how_it_affects_you="Go routines in switchyard workers are now bounded to 4 threads.",
        what_to_do_next=ActionGuidance(
            action_type="prepare",
            guidance="Audit worker thread saturation metrics.",
        ),
    )

    result = validate_card_content(valid_card, SAMPLE_COMMIT_LOG)
    assert result.is_valid is False
    assert result.status == "unvalidated"
    assert result.notes is not None
    assert result.notes.get("reason") == "commit_log_only"


def test_validator_passes_grounded_prose_card():
    valid_card = BriefingCardContent(
        what_happened=["PostgreSQL 19 introduces REPACK CONCURRENTLY command."],
        why_it_matters="Simplifies administration for mission-critical database workloads at scale.",
        how_it_affects_you="DBAs can optimize table storage without downtime or blocking ongoing writes.",
        what_to_do_next=ActionGuidance(
            action_type="apply",
            guidance="Test the pg_plan_advice extension in staging before production upgrades.",
        ),
    )

    result = validate_card_content(valid_card, SAMPLE_PROSE_ARTICLE)
    assert result.is_valid is True
    assert result.status == "passed"


def test_validator_rejects_invented_version_number():
    """Validator must reject a card containing an invented version number absent from source."""
    hallucinated_card = BriefingCardContent(
        what_happened=["PostgreSQL 25.4 introduces revolutionary storage compression."],
        why_it_matters="Improves database performance for extreme workloads.",
        how_it_affects_you="Engineers must update database configurations for the new engine.",
        what_to_do_next=ActionGuidance(
            action_type="prepare",
            guidance="Review upgrade guides for the new compression format.",
        ),
    )

    result = validate_card_content(hallucinated_card, SAMPLE_PROSE_ARTICLE)
    assert result.is_valid is False
    assert result.status == "flagged"
    assert result.notes is not None
    assert result.notes.get("reason") == "entity_hallucination"
    unsupported = result.notes.get("unsupported_entities", [])
    assert any("25.4" in str(item) for item in unsupported)


def test_validator_rejects_invented_cve_id():
    """Validator must reject a card containing an invented CVE ID absent from source."""
    hallucinated_card = BriefingCardContent(
        what_happened=["PostgreSQL 19 patches critical vulnerability CVE-2026-99999."],
        why_it_matters="Prevents remote unauthenticated code execution in database clusters.",
        how_it_affects_you="Unpatched database instances are at immediate risk of exploitation.",
        what_to_do_next=ActionGuidance(
            action_type="apply",
            guidance="Apply the security update across all production clusters immediately.",
        ),
    )

    result = validate_card_content(hallucinated_card, SAMPLE_PROSE_ARTICLE)
    assert result.is_valid is False
    assert result.status == "flagged"
    assert result.notes is not None
    assert result.notes.get("reason") == "entity_hallucination"
    unsupported = result.notes.get("unsupported_entities", [])
    assert any("CVE-2026-99999" in str(item) for item in unsupported)


def test_validator_rejects_absent_claim_or_product():
    """Validator must reject a card with claims about products or technologies not mentioned in source."""
    hallucinated_card = BriefingCardContent(
        what_happened=["PostgreSQL 19 now integrates natively with Snowflake warehouse."],
        why_it_matters="Simplifies cross-database analytics without external ETL pipelines.",
        how_it_affects_you="Data engineers can query analytics storage directly from database sessions.",
        what_to_do_next=ActionGuidance(
            action_type="learn",
            guidance="Explore connector documentation to test cross-system queries.",
        ),
    )

    result = validate_card_content(hallucinated_card, SAMPLE_PROSE_ARTICLE)
    assert result.is_valid is False
    assert result.status == "flagged"
    assert result.notes is not None
    assert result.notes.get("reason") == "entity_hallucination"
    unsupported = result.notes.get("unsupported_entities", [])
    assert any("Snowflake" in str(item) for item in unsupported)


def test_validator_passes_grounded_control_case():
    """Passing control case: card grounded strictly in source entities passes validation."""
    control_article = (
        "Redis announced the general availability of Redis 7.2. "
        "This release resolves CVE-2024-31449, a high-severity Lua script vulnerability. "
        "Operators are advised to upgrade promptly."
    )
    grounded_card = BriefingCardContent(
        what_happened=["Redis 7.2 resolves security advisory CVE-2024-31449 in Lua scripting."],
        why_it_matters="Mitigates high-severity vulnerability in database scripting engine.",
        how_it_affects_you="Production deployments running Lua scripts should be upgraded to prevent exploits.",
        what_to_do_next=ActionGuidance(
            action_type="apply",
            guidance="Upgrade Redis clusters to version 7.2 immediately.",
        ),
    )

    result = validate_card_content(grounded_card, control_article)
    assert result.is_valid is True
    assert result.status == "passed"
    assert result.notes is not None
    assert result.notes.get("entity_check") == "passed"
