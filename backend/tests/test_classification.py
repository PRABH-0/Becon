"""Unit tests for Becon classification, normalization, tagging, and severity scoring."""

import uuid
from datetime import UTC, datetime, timedelta

import app.database as app_db
from app.classification.category import classify_event_category
from app.classification.normalizer import normalize_event_title
from app.classification.severity import calculate_severity_score
from app.classification.tagger import (
    build_term_regex,
    extract_topic_version,
    match_event_topics,
    populate_event_topics,
)
from app.ingestion import IngestionStats, process_raw_item
from app.models import Event, FocusTopic, RawItem, Source, SourceTopic, TopicAlias


class TestTitleNormalizer:
    def test_strip_leading_tags(self):
        assert normalize_event_title("[ANN] Kubernetes 1.31.0") == "Kubernetes 1.31.0"
        assert normalize_event_title("[Release] Go 1.23.0") == "Go 1.23.0"
        assert normalize_event_title("[SECURITY] Advisory for Django") == "Advisory for Django"
        assert normalize_event_title("[UPDATE]: Python 3.12") == "Python 3.12"

    def test_reorder_release_patterns(self):
        assert normalize_event_title("Release v1.31.0 - Kubernetes") == "Kubernetes v1.31.0"
        assert normalize_event_title("Release 1.23.0 of Go") == "Go v1.23.0"
        assert normalize_event_title("Release PostgreSQL 16.4") == "PostgreSQL v16.4"

    def test_strip_trailing_vendor_and_blog_suffixes(self):
        assert normalize_event_title("New Gemini Capabilities - Google Developers Blog") == "New Gemini Capabilities"
        assert normalize_event_title("Go 1.23 is released - The Go Blog") == "Go 1.23 is released"
        assert normalize_event_title("TypeScript 5.6 - TypeScript") == "TypeScript 5.6"
        assert normalize_event_title("Building with Next.js - Blog - Company") == "Building with Next.js"
        assert normalize_event_title("Docker Desktop 4.33 - Docker Blog") == "Docker Desktop 4.33"

    def test_strip_boilerplate_prefixes(self):
        assert normalize_event_title("Announcing TypeScript 5.6") == "TypeScript 5.6"
        assert normalize_event_title("What's new in Python 3.13") == "Python 3.13"

    def test_preserves_versions_and_cves(self):
        assert normalize_event_title("CVE-2024-12345 in OpenSSL") == "CVE-2024-12345 in OpenSSL"
        assert normalize_event_title("Linux Kernel 6.10.5") == "Linux Kernel 6.10.5"


class TestCategoryClassifier:
    def test_advisory_source_classified_as_security(self):
        cat, breaking = classify_event_category(
            title="Update to library",
            source_type="advisory",
            source_slug="ghsa-advisories",
        )
        assert cat == "security"

    def test_cisa_kev_classified_as_security(self):
        cat, _ = classify_event_category(
            title="Known exploited vulnerability",
            source_slug="cisa-kev",
        )
        assert cat == "security"

    def test_cve_in_title_classified_as_security(self):
        cat, _ = classify_event_category(title="Fix for CVE-2024-4321")
        assert cat == "security"

    def test_eol_keywords(self):
        cat, breaking = classify_event_category(title="Node.js 18 End of Life announcement")
        assert cat == "eol"
        assert breaking is True

    def test_deprecation_keywords(self):
        cat, _ = classify_event_category(title="Deprecation of legacy REST endpoint")
        assert cat == "deprecation"

    def test_release_keywords(self):
        cat, _ = classify_event_category(title="Python 3.13.0 released")
        assert cat == "release"

    def test_breaking_changes_detected(self):
        cat, breaking = classify_event_category(
            title="TypeScript 5.6 release",
            text="Includes breaking changes and migration required for strict mode.",
        )
        assert cat == "release"
        assert breaking is True


class TestSeverityScoring:
    def test_cisa_kev_fixed_high_value(self):
        score = calculate_severity_score(
            category="security",
            is_breaking=False,
            raw_metadata={"cisa_kev": True},
            source_slug="cisa-kev",
            published_at=datetime.now(UTC),
            matched_topics_count=1,
            text="Active exploitation in wild",
        )
        # 85 base + 10 topic bonus + 0 decay = 95
        assert score >= 85

    def test_cvss_scaling(self):
        now = datetime.now(UTC)
        score_crit = calculate_severity_score(
            category="security",
            is_breaking=False,
            raw_metadata={"cvss_score": 9.8},
            source_slug="nvd-cve",
            published_at=now,
            matched_topics_count=0,
            text="Buffer overflow vulnerability",
        )
        score_low = calculate_severity_score(
            category="security",
            is_breaking=False,
            raw_metadata={"cvss_score": 3.1},
            source_slug="nvd-cve",
            published_at=now,
            matched_topics_count=0,
            text="Minor info disclosure",
        )
        assert score_crit > score_low
        assert score_crit >= 75

    def test_breaking_bonus(self):
        now = datetime.now(UTC)
        score_breaking = calculate_severity_score(
            category="release",
            is_breaking=True,
            published_at=now,
            matched_topics_count=0,
            text="Major breaking changes in API",
        )
        score_normal = calculate_severity_score(
            category="release",
            is_breaking=False,
            published_at=now,
            matched_topics_count=0,
            text="Minor bugfix update",
        )
        assert score_breaking == score_normal + 15

    def test_nvd_modified_date_used_for_recency(self):
        # Published 2 years ago, but modified yesterday
        old_pub = datetime.now(UTC) - timedelta(days=700)
        recent_mod = (datetime.now(UTC) - timedelta(days=2)).isoformat()
        score = calculate_severity_score(
            category="security",
            is_breaking=False,
            raw_metadata={"last_modified": recent_mod, "cvss_score": 8.0},
            source_slug="nvd-cve",
            published_at=old_pub,
            matched_topics_count=0,
            text="CVE updated vulnerability",
        )
        # Should not suffer -45 decay from 2-year old published date
        assert score >= 60

    def test_recency_decay_brackets(self):
        now = datetime.now(UTC)
        s_fresh = calculate_severity_score("release", False, published_at=now)
        s_30d = calculate_severity_score("release", False, published_at=now - timedelta(days=20))
        s_60d = calculate_severity_score("release", False, published_at=now - timedelta(days=60))
        s_200d = calculate_severity_score("release", False, published_at=now - timedelta(days=200))
        s_500d = calculate_severity_score("release", False, published_at=now - timedelta(days=500))

        assert s_fresh > s_30d >= s_60d >= s_200d >= s_500d


class TestTaggerAndAliases:
    def test_word_boundary_with_punctuation(self):
        pattern_dotnet = build_term_regex(".NET")
        assert pattern_dotnet.search("What is new in .NET 9?") is not None
        assert pattern_dotnet.search("Learn .NET Core today") is not None
        assert pattern_dotnet.search("Working with .NET:") is not None

        pattern_csharp = build_term_regex("C#")
        assert pattern_csharp.search("C# 13 features announced") is not None
        assert pattern_csharp.search("Learning C#.") is not None

        pattern_nodejs = build_term_regex("Node.js")
        assert pattern_nodejs.search("Running on Node.js 22") is not None

    def test_version_extraction(self):
        v = extract_topic_version("PostgreSQL 16.4 released", "PostgreSQL")
        assert v == "16.4"
        v2 = extract_topic_version("Python v3.12.5 announcement", "Python")
        assert v2 == "3.12.5"

    def test_match_event_topics_with_alias_and_boost(self):
        db = app_db.SessionLocal()
        try:
            # Create topic and alias
            topic = FocusTopic(id=uuid.uuid4(), name="React", slug=f"react-{uuid.uuid4().hex[:6]}", kind="technology", is_active=True)
            alias = TopicAlias(id=uuid.uuid4(), topic_id=topic.id, alias="reactjs")
            db.add(topic)
            db.add(alias)

            source = Source(
                id=uuid.uuid4(),
                slug=f"react-test-{uuid.uuid4().hex[:6]}",
                name="React Blog",
                feed_url=f"https://react.dev/feed-{uuid.uuid4().hex[:6]}.xml",
                site_url="https://react.dev",
                type="rss",
            )
            db.add(source)
            st = SourceTopic(source_id=source.id, topic_id=topic.id)
            db.add(st)
            db.commit()

            # Match using alias 'reactjs' in title
            matches = match_event_topics(
                db=db,
                title="Big changes coming in reactjs 19",
                text="",
                source=source,
            )
            assert len(matches) == 1
            matched_id, ver, conf = matches[0]
            assert matched_id == topic.id
            assert conf == 1.0  # 0.80 (title) + 0.20 (source boost) = 1.0
        finally:
            db.close()


class TestFallbackCardValidationStatus:
    def test_process_raw_item_sets_fallback_unvalidated(self):
        db = app_db.SessionLocal()
        try:
            source = Source(
                id=uuid.uuid4(),
                slug=f"test-src-{uuid.uuid4().hex[:6]}",
                name="Test Source",
                feed_url=f"https://example.com/feed-{uuid.uuid4().hex[:6]}.xml",
                site_url="https://example.com",
                type="rss",
            )
            db.add(source)
            db.commit()

            long_summary = (
                "A comprehensive summary describing CoolTool v2.0 features, performance improvements, "
                "database optimizations, and API updates for modern developer workflows across teams. "
                "Includes critical updates and migration guidance."
            )
            raw_item = RawItem(
                id=uuid.uuid4(),
                source_id=source.id,
                url=f"https://example.com/item-{uuid.uuid4().hex[:6]}",
                url_hash=f"hash-{uuid.uuid4().hex[:12]}",
                title="[ANN] Release v2.0 - CoolTool",
                summary=long_summary,
                content_text=long_summary,
                published_at=datetime.now(UTC),
                status="new",
            )
            db.add(raw_item)
            db.commit()

            stats = IngestionStats()
            card = process_raw_item(
                db=db,
                raw_item=raw_item,
                stats=stats,
            )

            assert card is not None
            assert card.model_name == "fallback-heuristic"
            assert card.validation_status == "unvalidated"
            assert card.validation_status != "passed"

            # Check event canonical_title was normalized
            event = db.query(Event).filter(Event.id == card.event_id).first()
            assert event is not None
            assert event.canonical_title == "CoolTool v2.0"
            assert event.category == "release"
            assert event.severity_score > 0
        finally:
            db.close()


def _ensure_test_topics(db):
    definitions = [
        ("TypeScript", "typescript", ["ts", "typescript"]),
        (".NET", "dotnet", [".net", "dotnet"]),
        ("ASP.NET Core", "aspnet-core", ["asp.net", "aspnet"]),
        ("C#", "csharp", ["c#", "csharp"]),
        ("Python", "python", ["py", "python3"]),
        ("Go", "golang", ["go", "golang"]),
        ("Next.js", "nextjs", ["next", "nextjs"]),
        ("Vite", "vite", ["vite", "vitejs"]),
        ("React", "react", ["react", "reactjs"]),
        ("Linux", "linux", ["linux", "ubuntu", "debian"]),
        ("Android", "android", ["android"]),
        ("Node.js", "nodejs", ["node", "node.js"]),
    ]
    topic_map = {}
    for name, slug, aliases in definitions:
        t = db.query(FocusTopic).filter(FocusTopic.slug == slug).first()
        if not t:
            t = FocusTopic(
                id=uuid.uuid4(),
                name=name,
                slug=slug,
                kind="technology",
                is_active=True,
            )
            db.add(t)
            db.flush()
            for al in aliases:
                existing_al = db.query(TopicAlias).filter(TopicAlias.alias == al).first()
                if not existing_al:
                    db.add(TopicAlias(id=uuid.uuid4(), topic_id=t.id, alias=al))
        topic_map[slug] = t
    db.commit()
    return topic_map


class TestTagPrecisionFix:
    """Regression tests for F2.1 tag precision fix."""

    def test_typescript_6_no_spurious_tags(self):
        db = app_db.SessionLocal()
        try:
            topics = _ensure_test_topics(db)
            ts_topic = topics["typescript"]
            source = Source(
                id=uuid.uuid4(),
                slug=f"ts-test-{uuid.uuid4().hex[:6]}",
                name="TypeScript Blog",
                feed_url=f"https://devblogs.microsoft.com/typescript/feed-{uuid.uuid4().hex[:6]}",
                site_url="https://devblogs.microsoft.com/typescript",
                type="rss",
            )
            db.add(source)
            db.add(SourceTopic(source_id=source.id, topic_id=ts_topic.id))
            db.commit()

            title = "Announcing TypeScript 6.0"
            body = (
                "TypeScript 6.0 is here! We are thrilled to share new features. "
                "Bundlers like Vite and Next.js can prepare. You can go try it out now."
            )
            matches = match_event_topics(db=db, title=title, text=body, source=source)
            matched_names = [db.query(FocusTopic).filter(FocusTopic.id == m[0]).first().name for m in matches]

            # Primary tag must be TypeScript with version 6.0
            assert len(matches) > 0
            primary_topic_name = matched_names[0]
            assert primary_topic_name == "TypeScript"
            assert matches[0][1] == "6.0"

            # Spurious tags must NOT be present
            assert "Go" not in matched_names
            assert "Vite" not in matched_names
            assert "Next.js" not in matched_names
        finally:
            db.close()

    def test_dotnet_11_no_spurious_tags(self):
        db = app_db.SessionLocal()
        try:
            topics = _ensure_test_topics(db)
            dotnet_topic = topics["dotnet"]
            source = Source(
                id=uuid.uuid4(),
                slug=f"dotnet-test-{uuid.uuid4().hex[:6]}",
                name=".NET Blog",
                feed_url=f"https://devblogs.microsoft.com/dotnet/feed-{uuid.uuid4().hex[:6]}",
                site_url="https://devblogs.microsoft.com/dotnet",
                type="rss",
            )
            db.add(source)
            db.add(SourceTopic(source_id=source.id, topic_id=dotnet_topic.id))
            db.commit()

            title = "Announcing .NET 11"
            body = (
                "Today we announce .NET 11 preview with updates across ASP.NET Core and C#. "
                "Developers can react to changes and run containers across linux and android devices."
            )
            matches = match_event_topics(db=db, title=title, text=body, source=source)
            matched_names = [db.query(FocusTopic).filter(FocusTopic.id == m[0]).first().name for m in matches]

            # Primary tag must be .NET with version 11
            assert len(matches) > 0
            assert matched_names[0] == ".NET"
            assert matches[0][1] == "11"

            # Spurious tags from casual words / single body mentions must NOT be matched
            assert "React" not in matched_names
            assert "Linux" not in matched_names
            assert "Android" not in matched_names
        finally:
            db.close()

    def test_refitter_advisory_no_python_tag(self):
        db = app_db.SessionLocal()
        try:
            _ensure_test_topics(db)
            title = "GHSA-p32v-8v8j-j534: Refitter allows arbitrary code execution through unescaped OpenAPI content-type values"
            body = (
                "Refitter generates C# API clients from OpenAPI specs. "
                "In setup.py or test.py scripts, arbitrary code execution could occur if malformed OpenAPI is parsed."
            )
            matches = match_event_topics(db=db, title=title, text=body, source=None)
            matched_names = [db.query(FocusTopic).filter(FocusTopic.id == m[0]).first().name for m in matches]

            # Python must NOT match from 'py' tokens in body
            assert "Python" not in matched_names
        finally:
            db.close()

    def test_untagged_event_allowed(self):
        db = app_db.SessionLocal()
        try:
            _ensure_test_topics(db)
            title = "General tech industry salary and career progression trends 2026"
            body = "A comprehensive analysis of compensation trends, engineering management practices, and interview loops."
            matches = match_event_topics(db=db, title=title, text=body, source=None)
            assert matches == []
        finally:
            db.close()

    def test_populate_event_topics_stores_is_primary(self):
        db = app_db.SessionLocal()
        try:
            _ensure_test_topics(db)
            event = Event(
                id=uuid.uuid4(),
                canonical_title="Announcing TypeScript 5.8 and Node.js 22 updates",
                canonical_url=f"https://example.com/item-{uuid.uuid4().hex[:6]}",
                category="release",
                severity_score=60,
                status="published",
            )
            db.add(event)
            db.commit()

            created = populate_event_topics(db=db, event=event, raw_item=None, source=None)
            db.commit()

            assert len(created) >= 2
            # First tag must have is_primary=True, rest False
            assert created[0].is_primary is True
            for other in created[1:]:
                assert other.is_primary is False

            # Model property primary_topic returns the primary FocusTopic
            reloaded_event = db.query(Event).filter(Event.id == event.id).first()
            assert reloaded_event.primary_topic is not None
            assert reloaded_event.primary_topic.name == "TypeScript"
        finally:
            db.close()
