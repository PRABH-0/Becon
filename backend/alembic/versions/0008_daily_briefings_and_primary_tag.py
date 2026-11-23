"""Add is_primary to event_topics and create daily_briefings table

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-23 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

portable_json = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    bind = op.get_bind()

    # Clean up any leftover temporary batch table if previous run was aborted
    bind.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_event_topics"))

    # 1. Add is_primary to event_topics
    with op.batch_alter_table("event_topics") as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_primary",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            )
        )

    # 2. Create daily_briefings table
    op.create_table(
        "daily_briefings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("briefing_date", sa.String(length=10), nullable=False),
        sa.Column("cards_payload", portable_json, nullable=False),
        sa.Column(
            "reading_time_minutes",
            sa.Integer(),
            server_default="3",
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user_profiles.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "briefing_date", name="uq_daily_briefings_user_id_date"
        ),
    )
    op.create_index(
        "ix_daily_briefings_user_id_date",
        "daily_briefings",
        ["user_id", "briefing_date"],
        unique=False,
    )

    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_index("ix_daily_briefings_user_id_date", table_name="daily_briefings")
    op.drop_table("daily_briefings")
    with op.batch_alter_table("event_topics") as batch_op:
        batch_op.drop_column("is_primary")
