"""Full schema migration for Becon career update companion

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-17 12:15:00.000000

"""
from typing import Sequence, Union
import logging

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

logger = logging.getLogger("alembic.runtime.migration")

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Portable JSON type: JSONB on PostgreSQL, JSON elsewhere
portable_json = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. Deduplicate existing emails in user_profiles and normalize to lowercase
    # -------------------------------------------------------------------------
    bind = op.get_bind()

    # Find duplicate rows (case-insensitive, keeping lowest id)
    dupes_query = sa.text("""
        SELECT id FROM user_profiles
        WHERE id NOT IN (
            SELECT MIN(id) FROM user_profiles
            GROUP BY lower(email)
        )
    """)
    duplicate_rows = bind.execute(dupes_query).fetchall()
    dupe_count = len(duplicate_rows)

    if dupe_count > 0:
        delete_query = sa.text("""
            DELETE FROM user_profiles
            WHERE id NOT IN (
                SELECT MIN(id) FROM user_profiles
                GROUP BY lower(email)
            )
        """)
        bind.execute(delete_query)
        msg = f"Deduplicated duplicate emails in user_profiles: merged/removed {dupe_count} rows"
        print(msg)
        logger.info(msg)
    else:
        msg = "Deduplicated duplicate emails in user_profiles: merged/removed 0 rows"
        print(msg)
        logger.info(msg)

    # Normalize remaining emails to lowercase
    bind.execute(sa.text("UPDATE user_profiles SET email = lower(email) WHERE email IS NOT NULL"))

    # -------------------------------------------------------------------------
    # 2. Create the 18 new tables
    # -------------------------------------------------------------------------

    # 1. professions
    op.create_table(
        "professions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_professions"),
    )
    op.create_index("ix_professions_slug", "professions", ["slug"], unique=True)

    # 2. focus_topics
    op.create_table(
        "focus_topics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('technology', 'tool', 'language', 'platform', 'domain', 'regulation', 'standard', 'topic')",
            name="ck_focus_topics_kind",
        ),
        sa.ForeignKeyConstraint(["parent_id"], ["focus_topics.id"], name="fk_focus_topics_parent_id_focus_topics", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_focus_topics"),
    )
    op.create_index("ix_focus_topics_slug", "focus_topics", ["slug"], unique=True)
    op.create_index("ix_focus_topics_parent_id", "focus_topics", ["parent_id"], unique=False)

    # 3. topic_aliases
    op.create_table(
        "topic_aliases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("alias", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["topic_id"], ["focus_topics.id"], name="fk_topic_aliases_topic_id_focus_topics", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_topic_aliases"),
    )
    op.create_index("ix_topic_aliases_alias", "topic_aliases", ["alias"], unique=True)
    op.create_index("ix_topic_aliases_topic_id", "topic_aliases", ["topic_id"], unique=False)

    # 4. profession_topics
    op.create_table(
        "profession_topics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profession_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["profession_id"], ["professions.id"], name="fk_profession_topics_profession_id_professions", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["focus_topics.id"], name="fk_profession_topics_topic_id_focus_topics", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_profession_topics"),
        sa.UniqueConstraint("profession_id", "topic_id", name="uq_profession_topics_profession_id_topic_id"),
    )
    op.create_index("ix_profession_topics_profession_id", "profession_topics", ["profession_id"], unique=False)
    op.create_index("ix_profession_topics_topic_id", "profession_topics", ["topic_id"], unique=False)

    # -------------------------------------------------------------------------
    # 3. Update user_profiles with new columns and foreign key to professions
    # -------------------------------------------------------------------------
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("external_auth_id", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("profession_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("timezone", sa.String(length=50), nullable=False, server_default="UTC"))
        batch_op.add_column(sa.Column("delivery_time", sa.String(length=10), nullable=False, server_default="07:00"))
        batch_op.add_column(sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("email_digest_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column("created_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key("fk_user_profiles_profession_id_professions", "professions", ["profession_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index("ix_user_profiles_email", ["email"], unique=True)
        batch_op.create_index("ix_user_profiles_external_auth_id", ["external_auth_id"], unique=True)
        batch_op.create_index("ix_user_profiles_profession_id", ["profession_id"], unique=False)

    # Backfill is_anonymous and created_at
    bind.execute(sa.text("UPDATE user_profiles SET is_anonymous = TRUE WHERE auth_provider = 'guest'"))
    bind.execute(sa.text('UPDATE user_profiles SET created_at = "lastUpdated" WHERE created_at IS NULL'))

    # 5. user_focus_topics
    op.create_table(
        "user_focus_topics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["topic_id"], ["focus_topics.id"], name="fk_user_focus_topics_topic_id_focus_topics", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user_profiles.id"], name="fk_user_focus_topics_user_id_user_profiles", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_user_focus_topics"),
        sa.UniqueConstraint("user_id", "topic_id", name="uq_user_focus_topics_user_id_topic_id"),
    )
    op.create_index("ix_user_focus_topics_user_id", "user_focus_topics", ["user_id"], unique=False)
    op.create_index("ix_user_focus_topics_topic_id", "user_focus_topics", ["topic_id"], unique=False)

    # 6. sources
    op.create_table(
        "sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("site_url", sa.String(length=1000), nullable=False),
        sa.Column("feed_url", sa.String(length=1000), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("trust_tier", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("fetch_interval_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("language", sa.String(length=10), nullable=False, server_default="en"),
        sa.Column("etag", sa.String(length=255), nullable=True),
        sa.Column("last_modified", sa.String(length=255), nullable=True),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "type IN ('rss', 'atom', 'github_release', 'advisory', 'youtube_channel', 'x_account', 'instagram_account')",
            name="ck_sources_type",
        ),
        sa.CheckConstraint("trust_tier IN (1, 2, 3)", name="ck_sources_trust_tier"),
        sa.PrimaryKeyConstraint("id", name="pk_sources"),
    )
    op.create_index("ix_sources_slug", "sources", ["slug"], unique=True)
    op.create_index("ix_sources_feed_url", "sources", ["feed_url"], unique=True)

    # 7. source_topics
    op.create_table(
        "source_topics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], name="fk_source_topics_source_id_sources", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["focus_topics.id"], name="fk_source_topics_topic_id_focus_topics", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_source_topics"),
        sa.UniqueConstraint("source_id", "topic_id", name="uq_source_topics_source_id_topic_id"),
    )
    op.create_index("ix_source_topics_source_id", "source_topics", ["source_id"], unique=False)
    op.create_index("ix_source_topics_topic_id", "source_topics", ["topic_id"], unique=False)

    # 8. user_follows
    op.create_table(
        "user_follows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], name="fk_user_follows_source_id_sources", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user_profiles.id"], name="fk_user_follows_user_id_user_profiles", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_user_follows"),
        sa.UniqueConstraint("user_id", "source_id", name="uq_user_follows_user_id_source_id"),
    )
    op.create_index("ix_user_follows_user_id", "user_follows", ["user_id"], unique=False)
    op.create_index("ix_user_follows_source_id", "user_follows", ["source_id"], unique=False)

    # 10. events (created before raw_items and cards so FKs resolve)
    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("canonical_title", sa.String(length=1000), nullable=False),
        sa.Column("canonical_url", sa.String(length=2000), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("severity_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_breaking", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("embedding", portable_json, nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "category IN ('release', 'deprecation', 'security', 'eol', 'industry', 'content')",
            name="ck_events_category",
        ),
        sa.CheckConstraint("severity_score >= 0 AND severity_score <= 100", name="ck_events_severity_score"),
        sa.CheckConstraint("status IN ('open', 'ready', 'published', 'flagged')", name="ck_events_status"),
        sa.PrimaryKeyConstraint("id", name="pk_events"),
    )
    op.create_index("ix_events_status_published_at", "events", ["status", "published_at"], unique=False)
    op.create_index("ix_events_category", "events", ["category"], unique=False)
    op.create_index("ix_events_severity_score", "events", ["severity_score"], unique=False)

    # 11. event_topics
    op.create_table(
        "event_topics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], name="fk_event_topics_event_id_events", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["focus_topics.id"], name="fk_event_topics_topic_id_focus_topics", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_event_topics"),
        sa.UniqueConstraint("event_id", "topic_id", name="uq_event_topics_event_id_topic_id"),
    )
    op.create_index("ix_event_topics_event_id", "event_topics", ["event_id"], unique=False)
    op.create_index("ix_event_topics_topic_id", "event_topics", ["topic_id"], unique=False)

    # 9. raw_items
    op.create_table(
        "raw_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(length=500), nullable=True),
        sa.Column("url", sa.String(length=2000), nullable=False),
        sa.Column("url_hash", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=1000), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False, server_default="en"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("event_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint("status IN ('new', 'processed', 'skipped', 'error')", name="ck_raw_items_status"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], name="fk_raw_items_event_id_events", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], name="fk_raw_items_source_id_sources", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_raw_items"),
        sa.UniqueConstraint("source_id", "url_hash", name="uq_raw_items_source_id_url_hash"),
    )
    op.create_index("ix_raw_items_source_id", "raw_items", ["source_id"], unique=False)
    op.create_index("ix_raw_items_event_id", "raw_items", ["event_id"], unique=False)
    op.create_index("ix_raw_items_status", "raw_items", ["status"], unique=False)
    op.create_index("ix_raw_items_published_at", "raw_items", ["published_at"], unique=False)

    # 12. cards
    op.create_table(
        "cards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("what_happened", portable_json, nullable=False),
        sa.Column("why_it_matters", sa.Text(), nullable=False),
        sa.Column("how_it_affects_you", sa.Text(), nullable=False),
        sa.Column("action_type", sa.String(length=20), nullable=False),
        sa.Column("action_guidance", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=2000), nullable=False),
        sa.Column("source_text_hash", sa.String(length=64), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("validation_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("validation_notes", portable_json, nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("action_type IN ('learn', 'apply', 'avoid', 'prepare')", name="ck_cards_action_type"),
        sa.CheckConstraint("validation_status IN ('pending', 'passed', 'failed', 'flagged')", name="ck_cards_validation_status"),
        sa.CheckConstraint("status IN ('draft', 'published', 'retracted')", name="ck_cards_status"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], name="fk_cards_event_id_events", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_cards"),
    )
    op.create_index("ix_cards_event_id", "cards", ["event_id"], unique=True)
    op.create_index("ix_cards_status_published_at", "cards", ["status", "published_at"], unique=False)
    op.create_index("ix_cards_validation_status", "cards", ["validation_status"], unique=False)

    # 13. card_variants
    op.create_table(
        "card_variants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("profession_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=True),
        sa.Column("how_it_affects_you", sa.Text(), nullable=False),
        sa.Column("action_type", sa.String(length=20), nullable=False),
        sa.Column("action_guidance", sa.Text(), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("action_type IN ('learn', 'apply', 'avoid', 'prepare')", name="ck_card_variants_action_type"),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], name="fk_card_variants_card_id_cards", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["profession_id"], ["professions.id"], name="fk_card_variants_profession_id_professions", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["focus_topics.id"], name="fk_card_variants_topic_id_focus_topics", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_card_variants"),
        sa.UniqueConstraint("card_id", "profession_id", "topic_id", name="uq_card_variants_card_profession_topic"),
    )
    op.create_index("ix_card_variants_card_id", "card_variants", ["card_id"], unique=False)
    op.create_index("ix_card_variants_profession_id", "card_variants", ["profession_id"], unique=False)
    op.create_index("ix_card_variants_topic_id", "card_variants", ["topic_id"], unique=False)
    # Partial unique index enforcing uniqueness when topic_id IS NULL
    op.create_index(
        "uq_card_variants_card_prof_null_topic",
        "card_variants",
        ["card_id", "profession_id"],
        unique=True,
        sqlite_where=sa.text("topic_id IS NULL"),
        postgresql_where=sa.text("topic_id IS NULL"),
    )

    # 14. saved_cards
    op.create_table(
        "saved_cards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], name="fk_saved_cards_card_id_cards", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user_profiles.id"], name="fk_saved_cards_user_id_user_profiles", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_saved_cards"),
        sa.UniqueConstraint("user_id", "card_id", name="uq_saved_cards_user_id_card_id"),
    )
    op.create_index("ix_saved_cards_user_id", "saved_cards", ["user_id"], unique=False)
    op.create_index("ix_saved_cards_card_id", "saved_cards", ["card_id"], unique=False)

    # 15. card_feedback
    op.create_table(
        "card_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("value IN (-1, 1)", name="ck_card_feedback_value"),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], name="fk_card_feedback_card_id_cards", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user_profiles.id"], name="fk_card_feedback_user_id_user_profiles", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_card_feedback"),
        sa.UniqueConstraint("user_id", "card_id", name="uq_card_feedback_user_id_card_id"),
    )
    op.create_index("ix_card_feedback_user_id", "card_feedback", ["user_id"], unique=False)
    op.create_index("ix_card_feedback_card_id", "card_feedback", ["card_id"], unique=False)

    # 16. error_reports
    op.create_table(
        "error_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('open', 'reviewing', 'resolved', 'rejected')", name="ck_error_reports_status"),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"], name="fk_error_reports_card_id_cards", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user_profiles.id"], name="fk_error_reports_user_id_user_profiles", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_error_reports"),
    )
    op.create_index("ix_error_reports_user_id", "error_reports", ["user_id"], unique=False)
    op.create_index("ix_error_reports_card_id", "error_reports", ["card_id"], unique=False)

    # 17. deliveries
    op.create_table(
        "deliveries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("payload_ref", portable_json, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("channel IN ('email', 'telegram')", name="ck_deliveries_channel"),
        sa.CheckConstraint("kind IN ('digest', 'alert')", name="ck_deliveries_kind"),
        sa.CheckConstraint("status IN ('pending', 'sent', 'failed', 'skipped')", name="ck_deliveries_status"),
        sa.ForeignKeyConstraint(["user_id"], ["user_profiles.id"], name="fk_deliveries_user_id_user_profiles", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_deliveries"),
    )
    op.create_index("ix_deliveries_user_id", "deliveries", ["user_id"], unique=False)
    op.create_index("ix_deliveries_status_scheduled_for", "deliveries", ["status", "scheduled_for"], unique=False)

    # 18. metrics_events
    op.create_table(
        "metrics_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("session_id", sa.String(length=100), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("properties", portable_json, nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user_profiles.id"], name="fk_metrics_events_user_id_user_profiles", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_metrics_events"),
    )
    op.create_index("ix_metrics_events_name_occurred_at", "metrics_events", ["name", "occurred_at"], unique=False)
    op.create_index("ix_metrics_events_user_id_occurred_at", "metrics_events", ["user_id", "occurred_at"], unique=False)
    op.create_index("ix_metrics_events_user_id", "metrics_events", ["user_id"], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index("ix_metrics_events_user_id", table_name="metrics_events")
    op.drop_index("ix_metrics_events_user_id_occurred_at", table_name="metrics_events")
    op.drop_index("ix_metrics_events_name_occurred_at", table_name="metrics_events")
    op.drop_table("metrics_events")

    op.drop_index("ix_deliveries_status_scheduled_for", table_name="deliveries")
    op.drop_index("ix_deliveries_user_id", table_name="deliveries")
    op.drop_table("deliveries")

    op.drop_index("ix_error_reports_card_id", table_name="error_reports")
    op.drop_index("ix_error_reports_user_id", table_name="error_reports")
    op.drop_table("error_reports")

    op.drop_index("ix_card_feedback_card_id", table_name="card_feedback")
    op.drop_index("ix_card_feedback_user_id", table_name="card_feedback")
    op.drop_table("card_feedback")

    op.drop_index("ix_saved_cards_card_id", table_name="saved_cards")
    op.drop_index("ix_saved_cards_user_id", table_name="saved_cards")
    op.drop_table("saved_cards")

    op.drop_index("uq_card_variants_card_prof_null_topic", table_name="card_variants")
    op.drop_index("ix_card_variants_topic_id", table_name="card_variants")
    op.drop_index("ix_card_variants_profession_id", table_name="card_variants")
    op.drop_index("ix_card_variants_card_id", table_name="card_variants")
    op.drop_table("card_variants")

    op.drop_index("ix_cards_validation_status", table_name="cards")
    op.drop_index("ix_cards_status_published_at", table_name="cards")
    op.drop_index("ix_cards_event_id", table_name="cards")
    op.drop_table("cards")

    op.drop_index("ix_raw_items_published_at", table_name="raw_items")
    op.drop_index("ix_raw_items_status", table_name="raw_items")
    op.drop_index("ix_raw_items_event_id", table_name="raw_items")
    op.drop_index("ix_raw_items_source_id", table_name="raw_items")
    op.drop_table("raw_items")

    op.drop_index("ix_event_topics_topic_id", table_name="event_topics")
    op.drop_index("ix_event_topics_event_id", table_name="event_topics")
    op.drop_table("event_topics")

    op.drop_index("ix_events_severity_score", table_name="events")
    op.drop_index("ix_events_category", table_name="events")
    op.drop_index("ix_events_status_published_at", table_name="events")
    op.drop_table("events")

    op.drop_index("ix_user_follows_source_id", table_name="user_follows")
    op.drop_index("ix_user_follows_user_id", table_name="user_follows")
    op.drop_table("user_follows")

    op.drop_index("ix_source_topics_topic_id", table_name="source_topics")
    op.drop_index("ix_source_topics_source_id", table_name="source_topics")
    op.drop_table("source_topics")

    op.drop_index("ix_sources_feed_url", table_name="sources")
    op.drop_index("ix_sources_slug", table_name="sources")
    op.drop_table("sources")

    op.drop_index("ix_user_focus_topics_topic_id", table_name="user_focus_topics")
    op.drop_index("ix_user_focus_topics_user_id", table_name="user_focus_topics")
    op.drop_table("user_focus_topics")

    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_index("ix_user_profiles_profession_id")
        batch_op.drop_index("ix_user_profiles_external_auth_id")
        batch_op.drop_index("ix_user_profiles_email")
        batch_op.drop_constraint("fk_user_profiles_profession_id_professions", type_="foreignkey")
        batch_op.drop_column("deleted_at")
        batch_op.drop_column("created_at")
        batch_op.drop_column("email_digest_enabled")
        batch_op.drop_column("is_anonymous")
        batch_op.drop_column("delivery_time")
        batch_op.drop_column("timezone")
        batch_op.drop_column("profession_id")
        batch_op.drop_column("external_auth_id")

    op.drop_index("ix_profession_topics_topic_id", table_name="profession_topics")
    op.drop_index("ix_profession_topics_profession_id", table_name="profession_topics")
    op.drop_table("profession_topics")

    op.drop_index("ix_topic_aliases_topic_id", table_name="topic_aliases")
    op.drop_index("ix_topic_aliases_alias", table_name="topic_aliases")
    op.drop_table("topic_aliases")

    op.drop_index("ix_focus_topics_parent_id", table_name="focus_topics")
    op.drop_index("ix_focus_topics_slug", table_name="focus_topics")
    op.drop_table("focus_topics")

    op.drop_index("ix_professions_slug", table_name="professions")
    op.drop_table("professions")
