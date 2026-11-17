"""Baseline migration matching initial schema

Revision ID: 0001
Revises: None
Create Date: 2026-11-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("role", sa.String(length=200), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("experience", sa.String(length=100), nullable=True),
        sa.Column("interests", sa.String(length=1000), nullable=True),
        sa.Column("customPrompt", sa.String(length=2000), nullable=True),
        sa.Column("aiTone", sa.String(length=100), nullable=True),
        sa.Column("password_hash", sa.String(length=500), nullable=True),
        sa.Column("picture_url", sa.String(length=1000), nullable=True),
        sa.Column("auth_provider", sa.String(length=50), nullable=True),
        sa.Column("lastUpdated", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_user_profiles"),
    )
    op.create_index("ix_user_profiles_id", "user_profiles", ["id"], unique=False)

    op.create_table(
        "saved_briefings",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("target_role", sa.String(length=200), nullable=True),
        sa.Column("target_stack", sa.String(length=500), nullable=True),
        sa.Column("priority", sa.String(length=50), nullable=True),
        sa.Column("card_content_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_saved_briefings"),
    )
    op.create_index("ix_saved_briefings_id", "saved_briefings", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_saved_briefings_id", table_name="saved_briefings")
    op.drop_table("saved_briefings")
    op.drop_index("ix_user_profiles_id", table_name="user_profiles")
    op.drop_table("user_profiles")
