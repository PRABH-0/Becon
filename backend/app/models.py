"""Data models for Becon.

Includes:
- Legacy UserProfile and SavedBriefing (retained for backward compatibility, legacy fields marked DEPRECATED).
- Full 1.3 schema: professions, focus_topics, topic_aliases, profession_topics,
  user_focus_topics, sources, source_topics, user_follows, raw_items, events,
  event_topics, cards, card_variants, saved_cards, card_feedback, error_reports,
  deliveries, metrics_events.
"""

import uuid
from datetime import UTC, datetime
from typing import List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym, validates

from app.database import Base

# Portable JSON column: JSONB on PostgreSQL, standard JSON elsewhere
PortableJSON = JSON().with_variant(JSONB, "postgresql")


class UserProfile(Base):
    """User profile table.

    Notes:
    - Legacy fields (role, interests, customPrompt, aiTone, experience) are DEPRECATED.
      New preferences should use profession_id and user_focus_topics.
    - email is normalized to lowercase on write and unique.
    - external_auth_id will link Supabase Auth user UUID in phase 1.4.
    """

    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str | None] = mapped_column(String(100), default="", nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), default=None, unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(500), nullable=True)
    picture_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    auth_provider: Mapped[str | None] = mapped_column(String(50), default="local", nullable=True)
    lastUpdated: Mapped[datetime | None] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=True)

    # Phase 1.3 additions
    external_auth_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True, nullable=True)
    profession_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("professions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", server_default="UTC", nullable=False)
    delivery_time: Mapped[str] = mapped_column(String(10), default="07:00", server_default="07:00", nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    email_digest_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Legacy fields - DEPRECATED
    role: Mapped[str | None] = mapped_column(String(200), default="", nullable=True)
    experience: Mapped[str | None] = mapped_column(String(100), default="", nullable=True)
    interests: Mapped[str | None] = mapped_column(String(1000), default="", nullable=True)  # Comma separated
    customPrompt: Mapped[str | None] = mapped_column(String(2000), default="", nullable=True)
    aiTone: Mapped[str | None] = mapped_column(String(100), default="", nullable=True)

    # Relationships
    profession: Mapped[Optional["Profession"]] = relationship("Profession", back_populates="users")
    focus_topics: Mapped[List["UserFocusTopic"]] = relationship(
        "UserFocusTopic", back_populates="user", cascade="all, delete-orphan"
    )
    follows: Mapped[List["UserFollow"]] = relationship(
        "UserFollow", back_populates="user", cascade="all, delete-orphan"
    )
    saved_cards: Mapped[List["SavedCard"]] = relationship(
        "SavedCard", back_populates="user", cascade="all, delete-orphan"
    )
    feedback: Mapped[List["CardFeedback"]] = relationship(
        "CardFeedback", back_populates="user", cascade="all, delete-orphan"
    )
    error_reports: Mapped[List["ErrorReport"]] = relationship("ErrorReport", back_populates="user")
    deliveries: Mapped[List["Delivery"]] = relationship("Delivery", back_populates="user", cascade="all, delete-orphan")
    daily_briefings: Mapped[List["DailyBriefing"]] = relationship(
        "DailyBriefing", back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    @validates("email")
    def validate_email(self, key, address):
        if address:
            return address.strip().lower()
        return None


class SavedBriefing(Base):
    """Legacy saved briefings table.

    DEPRECATED: No user link, unused by modern cards. Dropped in Phase 6.5 (after saved_cards UI ships).
    """

    __tablename__ = "saved_briefings"

    id = Column(String(100), primary_key=True, index=True)
    title = Column(String(500))
    source_url = Column(String(1000))
    target_role = Column(String(200))
    target_stack = Column(String(500))  # Comma separated
    priority = Column(String(50))
    card_content_json = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class Profession(Base):
    """Target professions for career briefings."""

    __tablename__ = "professions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    users: Mapped[List["UserProfile"]] = relationship("UserProfile", back_populates="profession")
    profession_topics: Mapped[List["ProfessionTopic"]] = relationship(
        "ProfessionTopic", back_populates="profession", cascade="all, delete-orphan"
    )
    card_variants: Mapped[List["CardVariant"]] = relationship(
        "CardVariant", back_populates="profession", cascade="all, delete-orphan"
    )
    source_professions: Mapped[List["SourceProfession"]] = relationship(
        "SourceProfession", back_populates="profession", cascade="all, delete-orphan"
    )


class FocusTopic(Base):
    """Specific topics, tools, technologies, regulations or standards."""

    __tablename__ = "focus_topics"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('technology', 'tool', 'language', 'platform', 'domain', 'regulation', 'standard', 'topic')",
            name="ck_focus_topics_kind",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("focus_topics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    parent: Mapped[Optional["FocusTopic"]] = relationship("FocusTopic", remote_side=[id], back_populates="children")
    children: Mapped[List["FocusTopic"]] = relationship("FocusTopic", back_populates="parent")
    aliases: Mapped[List["TopicAlias"]] = relationship(
        "TopicAlias", back_populates="topic", cascade="all, delete-orphan"
    )
    profession_topics: Mapped[List["ProfessionTopic"]] = relationship(
        "ProfessionTopic", back_populates="topic", cascade="all, delete-orphan"
    )
    user_focus_topics: Mapped[List["UserFocusTopic"]] = relationship(
        "UserFocusTopic", back_populates="topic", cascade="all, delete-orphan"
    )
    source_topics: Mapped[List["SourceTopic"]] = relationship(
        "SourceTopic", back_populates="topic", cascade="all, delete-orphan"
    )
    event_topics: Mapped[List["EventTopic"]] = relationship(
        "EventTopic", back_populates="topic", cascade="all, delete-orphan"
    )


class TopicAlias(Base):
    """Alternative names and spellings mapped to a single canonical focus topic."""

    __tablename__ = "topic_aliases"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("focus_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    topic: Mapped["FocusTopic"] = relationship("FocusTopic", back_populates="aliases")

    @validates("alias")
    def validate_alias(self, key, val):
        if val:
            return val.strip().lower()
        return val


class ProfessionTopic(Base):
    """Suggested focus topics for onboarding per profession."""

    __tablename__ = "profession_topics"
    __table_args__ = (
        UniqueConstraint("profession_id", "topic_id", name="uq_profession_topics_profession_id_topic_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    profession_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("professions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("focus_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    profession: Mapped["Profession"] = relationship("Profession", back_populates="profession_topics")
    topic: Mapped["FocusTopic"] = relationship("FocusTopic", back_populates="profession_topics")


class UserFocusTopic(Base):
    """Topics explicitly chosen by a user to personalize their briefings."""

    __tablename__ = "user_focus_topics"
    __table_args__ = (UniqueConstraint("user_id", "topic_id", name="uq_user_focus_topics_user_id_topic_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("focus_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="focus_topics")
    topic: Mapped["FocusTopic"] = relationship("FocusTopic", back_populates="user_focus_topics")


class Source(Base):
    """External content sources (feeds, release notes, advisories)."""

    __tablename__ = "sources"
    __table_args__ = (
        CheckConstraint(
            "type IN ('rss', 'atom', 'github_release', 'advisory', 'youtube_channel', 'x_account', 'instagram_account')",
            name="ck_sources_type",
        ),
        CheckConstraint("trust_tier IN (1, 2, 3)", name="ck_sources_trust_tier"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    site_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    feed_url: Mapped[str] = mapped_column(String(1000), unique=True, index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    trust_tier: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    fetch_interval_minutes: Mapped[int] = mapped_column(Integer, default=60, server_default="60", nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", server_default="en", nullable=False)
    etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="healthy", server_default="healthy", nullable=False)
    next_fetch_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    fetch_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    source_topics: Mapped[List["SourceTopic"]] = relationship(
        "SourceTopic", back_populates="source", cascade="all, delete-orphan"
    )
    source_professions: Mapped[List["SourceProfession"]] = relationship(
        "SourceProfession", back_populates="source", cascade="all, delete-orphan"
    )
    follows: Mapped[List["UserFollow"]] = relationship(
        "UserFollow", back_populates="source", cascade="all, delete-orphan"
    )
    raw_items: Mapped[List["RawItem"]] = relationship("RawItem", back_populates="source", cascade="all, delete-orphan")

    # Synonyms / Aliases for ergonomic access across schema versions
    homepage_url = synonym("site_url")
    source_type = synonym("type")
    poll_interval_minutes = synonym("fetch_interval_minutes")
    is_active = synonym("enabled")

    @property
    def trust_tier_label(self) -> str:
        mapping = {1: "official", 2: "vendor", 3: "curated_creator"}
        return mapping.get(self.trust_tier, "official")


class SourceProfession(Base):
    """Professions associated with a source."""

    __tablename__ = "source_professions"
    __table_args__ = (
        UniqueConstraint("source_id", "profession_id", name="uq_source_professions_source_id_profession_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profession_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("professions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    source: Mapped["Source"] = relationship("Source", back_populates="source_professions")
    profession: Mapped["Profession"] = relationship("Profession", back_populates="source_professions")


class SourceTopic(Base):
    """Topics covered by a source."""

    __tablename__ = "source_topics"
    __table_args__ = (UniqueConstraint("source_id", "topic_id", name="uq_source_topics_source_id_topic_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("focus_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    source: Mapped["Source"] = relationship("Source", back_populates="source_topics")
    topic: Mapped["FocusTopic"] = relationship("FocusTopic", back_populates="source_topics")


class UserFollow(Base):
    """User follows for sources / creators (prepares Phase 9)."""

    __tablename__ = "user_follows"
    __table_args__ = (UniqueConstraint("user_id", "source_id", name="uq_user_follows_user_id_source_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="follows")
    source: Mapped["Source"] = relationship("Source", back_populates="follows")


class RawItem(Base):
    """Raw fetched item from external sources before deduplication."""

    __tablename__ = "raw_items"
    __table_args__ = (
        UniqueConstraint("source_id", "url_hash", name="uq_raw_items_source_id_url_hash"),
        CheckConstraint("status IN ('new', 'processed', 'skipped', 'error')", name="ck_raw_items_status"),
        Index("ix_raw_items_status", "status"),
        Index("ix_raw_items_published_at", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    url_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 hex
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_metadata: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    language: Mapped[str] = mapped_column(String(10), default="en", server_default="en", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="new", server_default="new", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Relationships
    source: Mapped["Source"] = relationship("Source", back_populates="raw_items")
    event: Mapped[Optional["Event"]] = relationship("Event", back_populates="raw_items")


class Event(Base):
    """Deduplicated canonical career event across multiple raw items."""

    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint(
            "category IN ('release', 'deprecation', 'security', 'eol', 'industry', 'content')",
            name="ck_events_category",
        ),
        CheckConstraint("severity_score >= 0 AND severity_score <= 100", name="ck_events_severity_score"),
        CheckConstraint("status IN ('open', 'ready', 'published', 'flagged')", name="ck_events_status"),
        Index("ix_events_status_published_at", "status", "published_at"),
        Index("ix_events_category", "category"),
        Index("ix_events_severity_score", "severity_score"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    canonical_title: Mapped[str] = mapped_column(String(1000), nullable=False)
    canonical_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    severity_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_breaking: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    embedding: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    raw_items: Mapped[List["RawItem"]] = relationship("RawItem", back_populates="event")
    event_topics: Mapped[List["EventTopic"]] = relationship(
        "EventTopic", back_populates="event", cascade="all, delete-orphan"
    )
    card: Mapped[Optional["Card"]] = relationship(
        "Card", back_populates="event", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def primary_topic(self) -> Optional["FocusTopic"]:
        for et in self.event_topics:
            if getattr(et, "is_primary", False) and et.topic:
                return et.topic
        if self.event_topics and self.event_topics[0].topic:
            return self.event_topics[0].topic
        return None


class EventTopic(Base):
    """Topics linked to a canonical event with confidence."""

    __tablename__ = "event_topics"
    __table_args__ = (UniqueConstraint("event_id", "topic_id", name="uq_event_topics_event_id_topic_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("focus_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="event_topics")
    topic: Mapped["FocusTopic"] = relationship("FocusTopic", back_populates="event_topics")


class Card(Base):
    """Canonical Action Card generated for an event."""

    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint("action_type IN ('learn', 'apply', 'avoid', 'prepare')", name="ck_cards_action_type"),
        CheckConstraint(
            "validation_status IN ('pending', 'passed', 'failed', 'flagged', 'unvalidated')",
            name="ck_cards_validation_status",
        ),
        CheckConstraint("status IN ('draft', 'published', 'retracted')", name="ck_cards_status"),
        Index("ix_cards_status_published_at", "status", "published_at"),
        Index("ix_cards_validation_status", "validation_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("events.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    what_happened: Mapped[list] = mapped_column(PortableJSON, nullable=False)  # JSON list of strings
    why_it_matters: Mapped[str] = mapped_column(Text, nullable=False)
    how_it_affects_you: Mapped[str] = mapped_column(Text, nullable=False)  # Generic baseline
    action_type: Mapped[str] = mapped_column(String(20), nullable=False)
    action_guidance: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    source_text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False
    )
    validation_notes: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="card")
    variants: Mapped[List["CardVariant"]] = relationship(
        "CardVariant", back_populates="card", cascade="all, delete-orphan"
    )
    saved_by: Mapped[List["SavedCard"]] = relationship("SavedCard", back_populates="card", cascade="all, delete-orphan")
    feedback: Mapped[List["CardFeedback"]] = relationship(
        "CardFeedback", back_populates="card", cascade="all, delete-orphan"
    )
    error_reports: Mapped[List["ErrorReport"]] = relationship(
        "ErrorReport", back_populates="card", cascade="all, delete-orphan"
    )


class CardVariant(Base):
    """Profession- or topic-personalized variant of an Action Card."""

    __tablename__ = "card_variants"
    __table_args__ = (
        CheckConstraint(
            "action_type IN ('learn', 'apply', 'avoid', 'prepare')",
            name="ck_card_variants_action_type",
        ),
        UniqueConstraint("card_id", "profession_id", "topic_id", name="uq_card_variants_card_profession_topic"),
        Index(
            "uq_card_variants_card_prof_null_topic",
            "card_id",
            "profession_id",
            unique=True,
            sqlite_where=text("topic_id IS NULL"),
            postgresql_where=text("topic_id IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profession_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("professions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("focus_topics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    how_it_affects_you: Mapped[str] = mapped_column(Text, nullable=False)
    action_type: Mapped[str] = mapped_column(String(20), nullable=False)
    action_guidance: Mapped[str] = mapped_column(Text, nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    card: Mapped["Card"] = relationship("Card", back_populates="variants")
    profession: Mapped["Profession"] = relationship("Profession", back_populates="card_variants")
    topic: Mapped[Optional["FocusTopic"]] = relationship("FocusTopic")


class SavedCard(Base):
    """User personal bookmarks of Action Cards."""

    __tablename__ = "saved_cards"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_saved_cards_user_id_card_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="saved_cards")
    card: Mapped["Card"] = relationship("Card", back_populates="saved_by")


class CardFeedback(Base):
    """User feedback (+1 / -1) on Action Cards."""

    __tablename__ = "card_feedback"
    __table_args__ = (
        CheckConstraint("value IN (-1, 1)", name="ck_card_feedback_value"),
        UniqueConstraint("user_id", "card_id", name="uq_card_feedback_user_id_card_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="feedback")
    card: Mapped["Card"] = relationship("Card", back_populates="feedback")


class ErrorReport(Base):
    """Factual error reports on Action Cards submitted by users."""

    __tablename__ = "error_reports"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'reviewing', 'resolved', 'rejected')",
            name="ck_error_reports_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)  # max 2000 chars enforced in app layer
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped[Optional["UserProfile"]] = relationship("UserProfile", back_populates="error_reports")
    card: Mapped["Card"] = relationship("Card", back_populates="error_reports")


class Delivery(Base):
    """Briefing deliveries via email or Telegram."""

    __tablename__ = "deliveries"
    __table_args__ = (
        CheckConstraint("channel IN ('email', 'telegram')", name="ck_deliveries_channel"),
        CheckConstraint("kind IN ('digest', 'alert')", name="ck_deliveries_kind"),
        CheckConstraint("status IN ('pending', 'sent', 'failed', 'skipped')", name="ck_deliveries_status"),
        Index("ix_deliveries_status_scheduled_for", "status", "scheduled_for"),
        Index("ix_deliveries_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending", nullable=False)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_ref: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="deliveries")


class MetricsEvent(Base):
    """Product analytics events (no personal data allowed in properties)."""

    __tablename__ = "metrics_events"
    __table_args__ = (
        Index("ix_metrics_events_name_occurred_at", "name", "occurred_at"),
        Index("ix_metrics_events_user_id_occurred_at", "user_id", "occurred_at"),
        Index("ix_metrics_events_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True
    )
    session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    properties: Mapped[dict] = mapped_column(PortableJSON, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    user: Mapped[Optional["UserProfile"]] = relationship("UserProfile")


class DailyBriefing(Base):
    """Cached daily intelligence briefing generated for a user per UTC day."""

    __tablename__ = "daily_briefings"
    __table_args__ = (
        UniqueConstraint("user_id", "briefing_date", name="uq_daily_briefings_user_id_date"),
        Index("ix_daily_briefings_user_id_date", "user_id", "briefing_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False
    )
    briefing_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD (UTC)
    cards_payload: Mapped[dict | list] = mapped_column(PortableJSON, nullable=False)
    reading_time_minutes: Mapped[int] = mapped_column(Integer, default=3, server_default="3", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="daily_briefings", passive_deletes=True)

