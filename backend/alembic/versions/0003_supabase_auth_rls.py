"""Supabase Auth RLS and nullable user email migration

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-17 13:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All application and system tables to be protected with RLS in PostgreSQL
ALL_TABLES = [
    "alembic_version",
    "user_profiles",
    "saved_briefings",
    "professions",
    "focus_topics",
    "topic_aliases",
    "profession_topics",
    "user_focus_topics",
    "sources",
    "source_topics",
    "user_follows",
    "raw_items",
    "events",
    "event_topics",
    "cards",
    "card_variants",
    "saved_cards",
    "card_feedback",
    "error_reports",
    "deliveries",
    "metrics_events",
]


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Clean existing placeholder/empty emails in user_profiles to NULL
    bind.execute(
        sa.text(
            "UPDATE user_profiles SET email = NULL WHERE email = '' OR email LIKE '%@guest.becon.local'"
        )
    )

    # 2. Make user_profiles.email nullable in batch mode (portable for SQLite & Postgres)
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.alter_column(
            "email",
            existing_type=sa.String(length=200),
            nullable=True,
        )

    # 3. On PostgreSQL only: ENABLE ROW LEVEL SECURITY with no policies (default-deny for anon/authenticated)
    if bind.dialect.name == "postgresql":
        for table_name in ALL_TABLES:
            bind.execute(sa.text(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;"))


def downgrade() -> None:
    bind = op.get_bind()

    # 1. Disable RLS on PostgreSQL (no-op on SQLite)
    if bind.dialect.name == "postgresql":
        for table_name in ALL_TABLES:
            bind.execute(sa.text(f"ALTER TABLE {table_name} DISABLE ROW LEVEL SECURITY;"))

    # 2. Fill NULL emails with a unique placeholder before restoring NOT NULL
    bind.execute(
        sa.text(
            "UPDATE user_profiles SET email = 'restored_user_' || id || '@restored.becon.local' WHERE email IS NULL"
        )
    )

    # 3. Restore NOT NULL constraint on user_profiles.email
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.alter_column(
            "email",
            existing_type=sa.String(length=200),
            nullable=False,
        )
