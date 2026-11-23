"""Unit and integration tests for F4 Relevance ranking & Daily Briefing Builder."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import app.database as app_db
from app.briefing_service import (
    build_daily_briefing,
    invalidate_daily_briefing_cache,
)
from app.models import (
    Card,
    DailyBriefing,
    Event,
    EventTopic,
    FocusTopic,
    Profession,
    RawItem,
    Source,
    SourceProfession,
    UserFocusTopic,
    UserProfile,
)


def _create_source(db, name, slug, profession_id=None):
    src = Source(
        id=uuid.uuid4(),
        slug=f"{slug}-{uuid.uuid4().hex[:6]}",
        name=name,
        feed_url=f"https://example.com/{slug}-{uuid.uuid4().hex[:6]}.xml",
        site_url=f"https://example.com/{slug}",
        type="rss",
    )
    db.add(src)
    db.flush()
    if profession_id:
        db.add(SourceProfession(source_id=src.id, profession_id=profession_id))
        db.flush()
    return src


def _create_event_and_card(
    db,
    source,
    title,
    category="release",
    severity=50,
    is_breaking=False,
    topic=None,
    version=None,
    published_days_ago=1,
    status="published",
    validation_status="passed",
    model_name="gemini-2.5-flash",
):
    pub_time = datetime.now(UTC) - timedelta(days=published_days_ago)
    event = Event(
        id=uuid.uuid4(),
        canonical_title=title,
        canonical_url=f"https://example.com/events/{uuid.uuid4().hex}",
        category=category,
        severity_score=severity,
        is_breaking=is_breaking,
        published_at=pub_time,
        status="published",
    )
    db.add(event)
    db.flush()

    raw = RawItem(
        id=uuid.uuid4(),
        source_id=source.id,
        event_id=event.id,
        url=f"https://example.com/raw/{uuid.uuid4().hex}",
        url_hash=uuid.uuid4().hex[:32],
        title=title,
        summary=f"Summary for {title}",
        status="processed",
        published_at=pub_time,
    )
    db.add(raw)
    db.flush()

    if topic:
        et = EventTopic(
            id=uuid.uuid4(),
            event_id=event.id,
            topic_id=topic.id,
            version=version,
            confidence=0.9,
            is_primary=True,
        )
        db.add(et)
        db.flush()

    card = Card(
        id=uuid.uuid4(),
        event_id=event.id,
        source_url=f"https://example.com/cards/{uuid.uuid4().hex}",
        source_text_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        status=status,
        validation_status=validation_status,
        model_name=model_name,
        prompt_version="1.0",
        action_type="learn",
        what_happened=["Key update bullet 1", "Key update bullet 2"],
        why_it_matters=f"Impact explanation for {title}",
        how_it_affects_you=f"How it affects you regarding {title}",
        action_guidance=f"Take this action for {title}",
        published_at=pub_time,
    )
    db.add(card)
    db.flush()
    return event, card


class TestRelevanceRankingAndScoring:
    def test_topic_matched_cards_outrank_generic_ones(self):
        db = app_db.SessionLocal()
        try:
            # Create user and topics
            user = UserProfile(
                id=101,
                name="Kubernetes Engineer",
                role="DevOps",
                interests="Kubernetes",
                is_anonymous=False,
            )
            db.add(user)

            k8s_topic = FocusTopic(
                id=uuid.uuid4(),
                name="Kubernetes",
                slug=f"k8s-{uuid.uuid4().hex[:6]}",
                kind="technology",
                is_active=True,
            )
            generic_topic = FocusTopic(
                id=uuid.uuid4(),
                name="General Tools",
                slug=f"tools-{uuid.uuid4().hex[:6]}",
                kind="tool",
                is_active=True,
            )
            db.add(k8s_topic)
            db.add(generic_topic)
            db.flush()

            db.add(UserFocusTopic(user_id=user.id, topic_id=k8s_topic.id))
            db.flush()

            src1 = _create_source(db, "K8s Official", "k8s-src")
            src2 = _create_source(db, "Generic News", "news-src")

            # Generic event with high severity (70)
            ev_generic, card_generic = _create_event_and_card(
                db, src2, "Generic Security Advisory", severity=70, topic=generic_topic
            )
            # K8s event with moderate severity (30)
            ev_k8s, card_k8s = _create_event_and_card(
                db, src1, "Kubernetes v1.31 Released", severity=30, topic=k8s_topic
            )
            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=5)

            # Topic match (+40) allows K8s to outrank generic despite lower base severity
            assert len(briefing) >= 2
            assert briefing[0].id == str(card_k8s.id)
            assert "Kubernetes" in briefing[0].match_reason
        finally:
            db.close()

    def test_lead_selection(self):
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=102, name="Test Lead User", is_anonymous=False)
            db.add(user)
            src = _create_source(db, "Source A", "src-a")

            _create_event_and_card(db, src, "Story 1", severity=20, published_days_ago=3)
            _, card_high = _create_event_and_card(db, src, "Story 2 High Impact", severity=90, is_breaking=True)
            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=5)
            assert len(briefing) >= 2

            # Top card is designated lead story
            assert briefing[0].is_lead is True
            assert briefing[0].priority == "lead"
            assert briefing[0].id == str(card_high.id)

            # Subsequent cards are not lead
            for other_card in briefing[1:]:
                assert other_card.is_lead is False
                assert other_card.priority != "lead"
        finally:
            db.close()

    def test_source_diversity_cap(self):
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=103, name="Diversity User", is_anonymous=False)
            db.add(user)

            src_busy = _create_source(db, "High Volume Blog", "high-vol")
            src_other = _create_source(db, "Other Blog", "other-blog")

            # Add 4 cards from src_busy
            for i in range(4):
                _create_event_and_card(db, src_busy, f"Busy Post {i}", severity=60 + i)

            # Add 3 cards from src_other
            for i in range(3):
                _create_event_and_card(db, src_other, f"Other Post {i}", severity=40 + i)

            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=6)

            # Count cards per source
            src_busy_count = 0
            for b in briefing:
                card_obj = db.query(Card).filter(Card.id == uuid.UUID(b.id)).first()
                if card_obj.event.raw_items[0].source_id == src_busy.id:
                    src_busy_count += 1

            # Diversity cap ensures max 2 cards from src_busy
            assert src_busy_count <= 2
            assert len(briefing) >= 4
        finally:
            db.close()

    def test_cold_start_fallback(self):
        db = app_db.SessionLocal()
        try:
            # Cold start: user without profile or topics
            src = _create_source(db, "Public Release Feed", "pub-feed")
            ev_high, card_high = _create_event_and_card(
                db, src, "Major Critical Security Vulnerability", severity=100, is_breaking=True
            )
            ev_low, card_low = _create_event_and_card(
                db, src, "Routine Minor Patch Update", severity=5, published_days_ago=10
            )
            db.commit()

            # Pass user=None and no interests
            briefing = build_daily_briefing(db=db, user=None, user_interests="", max_cards=10)

            # Cold start must never return empty when cards exist
            assert len(briefing) >= 2
            card_ids = [b.id for b in briefing]
            assert str(card_high.id) in card_ids
            assert str(card_low.id) in card_ids

            # Critical item outranks minor old item
            assert card_ids.index(str(card_high.id)) < card_ids.index(str(card_low.id))
            high_dto = next(b for b in briefing if b.id == str(card_high.id))
            assert high_dto.match_reason != ""
        finally:
            db.close()

    def test_reading_time_estimation(self):
        db = app_db.SessionLocal()
        try:
            src = _create_source(db, "Article Feed", "art-feed")
            _, card = _create_event_and_card(db, src, "Comprehensive Article", severity=40)
            db.commit()

            briefing = build_daily_briefing(db=db, user=None, max_cards=5)
            assert len(briefing) > 0
            assert briefing[0].reading_time_minutes is not None
            assert briefing[0].reading_time_minutes >= 1
        finally:
            db.close()


class TestDailyBriefingDBCache:
    def test_cache_hit_on_second_call_same_day(self):
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=201, name="Cache User", is_anonymous=False)
            db.add(user)
            src = _create_source(db, "Daily Source", "daily-src")
            _create_event_and_card(db, src, "First Morning Story", severity=70)
            db.commit()

            today_utc = datetime.now(UTC).strftime("%Y-%m-%d")

            # First call: generates and populates daily_briefings table
            briefing1 = build_daily_briefing(db=db, user=user)
            cached_row = (
                db.query(DailyBriefing)
                .filter(DailyBriefing.user_id == user.id, DailyBriefing.briefing_date == today_utc)
                .first()
            )
            assert cached_row is not None
            assert len(cached_row.cards_payload) == len(briefing1)

            # Add a new higher severity card afterwards
            _create_event_and_card(db, src, "New Afternoon Breaking Story", severity=99, is_breaking=True)
            db.commit()

            # Second call without force_refresh: returns cached payload
            briefing2 = build_daily_briefing(db=db, user=user, force_refresh=False)
            assert len(briefing2) == len(briefing1)
            assert briefing2[0].id == briefing1[0].id
            assert "Afternoon" not in [b.title for b in briefing2]

            # Third call with force_refresh: updates cache with latest story
            briefing3 = build_daily_briefing(db=db, user=user, force_refresh=True)
            assert any("Afternoon" in b.title for b in briefing3)
        finally:
            db.close()

    def test_cache_invalidation_on_profile_change(self):
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=202, name="Invalidation User", is_anonymous=False)
            db.add(user)
            src = _create_source(db, "Source X", "src-x")
            _create_event_and_card(db, src, "Story X", severity=50)
            db.commit()

            build_daily_briefing(db=db, user=user)
            assert db.query(DailyBriefing).filter(DailyBriefing.user_id == user.id).count() == 1

            # Invalidate cache
            deleted = invalidate_daily_briefing_cache(db=db, user_id=user.id)
            assert deleted == 1
            assert db.query(DailyBriefing).filter(DailyBriefing.user_id == user.id).count() == 0
        finally:
            db.close()

    def test_utc_day_rollover(self):
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=203, name="Rollover User", is_anonymous=False)
            db.add(user)
            src = _create_source(db, "Daily Feed", "daily-feed")
            _create_event_and_card(db, src, "Yesterday Story", severity=60)
            db.commit()

            # Seed yesterday's cache
            yesterday_str = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d")
            old_cache = DailyBriefing(
                id=uuid.uuid4(),
                user_id=user.id,
                briefing_date=yesterday_str,
                cards_payload=[{"id": "dummy-old-card"}],
                reading_time_minutes=2,
            )
            db.add(old_cache)
            db.commit()

            # Calling for today generates a new cache entry for today's UTC date
            briefing = build_daily_briefing(db=db, user=user)
            assert len(briefing) > 0

            today_str = datetime.now(UTC).strftime("%Y-%m-%d")
            today_cache = (
                db.query(DailyBriefing)
                .filter(DailyBriefing.user_id == user.id, DailyBriefing.briefing_date == today_str)
                .first()
            )
            assert today_cache is not None
            assert today_cache.briefing_date == today_str
        finally:
            db.close()

    def test_guest_path_makes_zero_gemini_calls(self):
        db = app_db.SessionLocal()
        try:
            guest_user = UserProfile(id=204, name="Guest", is_anonymous=True)
            db.add(guest_user)
            src = _create_source(db, "Feed", "feed")
            _create_event_and_card(db, src, "Guest View Story", severity=50)
            db.commit()

            with patch("app.ai_service.generate_action_card") as mock_gemini:
                briefing = build_daily_briefing(
                    db=db,
                    user=guest_user,
                    allow_variant_generation=False,
                )
                assert len(briefing) > 0
                mock_gemini.assert_not_called()
        finally:
            db.close()


class TestProfileDivergence:
    def test_dotnet_vs_kubernetes_profiles_get_distinct_briefings(self):
        """Acceptance requirement: Two profiles (.NET vs DevOps/Kubernetes) get clearly different briefings."""
        db = app_db.SessionLocal()
        try:
            # 1. Professions
            se_prof = Profession(
                id=uuid.uuid4(),
                slug=f"se-{uuid.uuid4().hex[:6]}",
                name="Software Engineer",
            )
            devops_prof = Profession(
                id=uuid.uuid4(),
                slug=f"devops-{uuid.uuid4().hex[:6]}",
                name="DevOps Engineer",
            )
            db.add(se_prof)
            db.add(devops_prof)
            db.flush()

            # 2. Topics
            dotnet_topic = FocusTopic(
                id=uuid.uuid4(),
                name=".NET",
                slug=f"dotnet-{uuid.uuid4().hex[:6]}",
                kind="platform",
                is_active=True,
            )
            k8s_topic = FocusTopic(
                id=uuid.uuid4(),
                name="Kubernetes",
                slug=f"k8s-{uuid.uuid4().hex[:6]}",
                kind="platform",
                is_active=True,
            )
            db.add(dotnet_topic)
            db.add(k8s_topic)
            db.flush()

            # 3. Sources
            dotnet_src = _create_source(db, ".NET Blog", "dotnet-blog", profession_id=se_prof.id)
            k8s_src = _create_source(db, "Kubernetes Blog", "k8s-blog", profession_id=devops_prof.id)

            # 4. Create distinct cards
            _, card_dotnet_1 = _create_event_and_card(db, dotnet_src, ".NET 10 Official Release", severity=50, topic=dotnet_topic)
            _, card_dotnet_2 = _create_event_and_card(db, dotnet_src, "ASP.NET Core Performance", severity=40, topic=dotnet_topic)
            _, card_k8s_1 = _create_event_and_card(db, k8s_src, "Kubernetes 1.32 Security Hardening", severity=50, topic=k8s_topic)
            _, card_k8s_2 = _create_event_and_card(db, k8s_src, "Horizontal Pod Autoscaler Updates", severity=40, topic=k8s_topic)
            db.commit()

            # 5. User 1: Software Engineer following .NET
            user_se = UserProfile(
                id=301,
                name="SE User",
                profession_id=se_prof.id,
                interests=".NET",
                is_anonymous=False,
            )
            db.add(user_se)
            db.flush()
            db.add(UserFocusTopic(user_id=user_se.id, topic_id=dotnet_topic.id))

            # 6. User 2: DevOps following Kubernetes
            user_devops = UserProfile(
                id=302,
                name="DevOps User",
                profession_id=devops_prof.id,
                interests="Kubernetes",
                is_anonymous=False,
            )
            db.add(user_devops)
            db.flush()
            db.add(UserFocusTopic(user_id=user_devops.id, topic_id=k8s_topic.id))
            db.commit()

            briefing_se = build_daily_briefing(db=db, user=user_se, max_cards=5)
            briefing_devops = build_daily_briefing(db=db, user=user_devops, max_cards=5)

            # SE top cards must be .NET
            assert briefing_se[0].id == str(card_dotnet_1.id)
            assert ".NET" in briefing_se[0].match_reason

            # DevOps top cards must be Kubernetes
            assert briefing_devops[0].id == str(card_k8s_1.id)
            assert "Kubernetes" in briefing_devops[0].match_reason

            # Top cards must be different
            assert briefing_se[0].id != briefing_devops[0].id
        finally:
            db.close()


class TestBriefingQualityRules:
    def test_briefing_smaller_than_5_is_valid(self):
        """Briefing returns fewer than 5 cards rather than padding with noise."""
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=401, name="Focused User", is_anonymous=False)
            db.add(user)
            topic = FocusTopic(
                id=uuid.uuid4(),
                name="Rust",
                slug=f"rust-{uuid.uuid4().hex[:6]}",
                kind="language",
                is_active=True,
            )
            db.add(topic)
            db.flush()
            db.add(UserFocusTopic(user_id=user.id, topic_id=topic.id))

            src = _create_source(db, "Rust Source", "rust-src")
            # Only 2 relevant cards exist
            _, c1 = _create_event_and_card(db, src, "Rust 1.82 Released", severity=60, topic=topic)
            _, c2 = _create_event_and_card(db, src, "Rust Borrow Checker Improvements", severity=40, topic=topic)
            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=10, min_cards=5)

            # Briefing has fewer than 5 cards (< 5) due to relevance floor (max 2 generic + 2 matched)
            assert len(briefing) < 5
            card_ids = [b.id for b in briefing]
            assert str(c1.id) in card_ids
            assert str(c2.id) in card_ids
        finally:
            db.close()

    def test_rc_suppressed_when_final_exists(self):
        """Prerelease (rc) is excluded when a final release of the same product+version exists."""
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=402, name="Docker Fan", is_anonymous=False)
            db.add(user)
            topic = FocusTopic(
                id=uuid.uuid4(),
                name="Docker",
                slug=f"docker-{uuid.uuid4().hex[:6]}",
                kind="technology",
                is_active=True,
            )
            db.add(topic)
            db.flush()
            db.add(UserFocusTopic(user_id=user.id, topic_id=topic.id))

            src = _create_source(db, "Docker CLI Releases", "docker-cli")
            # Final release and RC for the same version
            _, card_final = _create_event_and_card(
                db, src, "Docker v29.10.0", severity=60, topic=topic
            )
            _, card_rc = _create_event_and_card(
                db, src, "Docker v29.10.0-rc.2", severity=65, topic=topic
            )
            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=5)

            card_ids = [b.id for b in briefing]
            assert str(card_final.id) in card_ids
            # Prerelease must be completely suppressed
            assert str(card_rc.id) not in card_ids
        finally:
            db.close()

    def test_no_generic_card_as_lead_when_matched_card_exists(self):
        """Matched card is selected as Lead Story over generic cards."""
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=403, name="TypeScript Dev", is_anonymous=False)
            db.add(user)
            topic = FocusTopic(
                id=uuid.uuid4(),
                name="TypeScript",
                slug=f"ts-{uuid.uuid4().hex[:6]}",
                kind="language",
                is_active=True,
            )
            db.add(topic)
            db.flush()
            db.add(UserFocusTopic(user_id=user.id, topic_id=topic.id))

            ts_src = _create_source(db, "TS Source", "ts-src")
            generic_src = _create_source(db, "Generic Source", "gen-src")

            # TS card has moderate severity (30)
            _, card_ts = _create_event_and_card(
                db, ts_src, "TypeScript 5.6 Released", severity=30, topic=topic
            )
            # Generic card has higher severity (75), but no topic/profession match
            _, card_gen = _create_event_and_card(
                db, generic_src, "Apache Axis Vulnerability", severity=75, category="security"
            )
            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=5)

            # TS card must be Lead, NOT generic
            assert briefing[0].id == str(card_ts.id)
            assert briefing[0].is_lead is True
            assert "TypeScript" in briefing[0].match_reason
        finally:
            db.close()

    def test_prerelease_never_lead(self):
        """Prereleases receive score penalty and can never be assigned is_lead=True."""
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=404, name="Angular Tester", is_anonymous=False)
            db.add(user)
            topic = FocusTopic(
                id=uuid.uuid4(),
                name="Angular",
                slug=f"ng-{uuid.uuid4().hex[:6]}",
                kind="technology",
                is_active=True,
            )
            db.add(topic)
            db.flush()
            db.add(UserFocusTopic(user_id=user.id, topic_id=topic.id))

            src = _create_source(db, "Angular Feed", "ng-feed")
            # Only an RC exists
            _, card_rc = _create_event_and_card(
                db, src, "Angular 22.4.0-rc.1", severity=80, topic=topic
            )
            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=5)

            rc_card = next(b for b in briefing if b.id == str(card_rc.id))
            # Prerelease cannot be Lead
            assert rc_card.is_lead is False
            assert rc_card.priority != "lead"
        finally:
            db.close()

    def test_generic_cards_capped_at_2(self):
        """A user with preferences receives at most 2 generic/unmatched cards."""
        db = app_db.SessionLocal()
        try:
            user = UserProfile(id=405, name="Vue Fan", is_anonymous=False)
            db.add(user)
            topic = FocusTopic(
                id=uuid.uuid4(),
                name="Vue",
                slug=f"vue-{uuid.uuid4().hex[:6]}",
                kind="technology",
                is_active=True,
            )
            db.add(topic)
            db.flush()
            db.add(UserFocusTopic(user_id=user.id, topic_id=topic.id))

            src_vue = _create_source(db, "Vue Source", "vue-src")
            src_gen = _create_source(db, "Generic Source", "gen-src-multi")

            # 1 matched card
            _create_event_and_card(db, src_vue, "Vue 3.5 Released", severity=50, topic=topic)
            # 5 generic cards (severity < 90, so not critical security)
            for i in range(5):
                _create_event_and_card(
                    db, src_gen, f"Generic Signal {i}", severity=40 + i, category="release"
                )
            db.commit()

            briefing = build_daily_briefing(db=db, user=user, max_cards=10)

            # Total = 1 matched + at most 2 generic = 3 cards
            assert len(briefing) == 3
        finally:
            db.close()

