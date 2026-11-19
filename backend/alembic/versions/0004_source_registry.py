"""Source registry and source professions association migration

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-19 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Create source_professions join table
    op.create_table(
        "source_professions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("profession_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["profession_id"],
            ["professions.id"],
            name="fk_source_professions_profession_id_professions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["sources.id"],
            name="fk_source_professions_source_id_sources",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_source_professions"),
        sa.UniqueConstraint(
            "source_id", "profession_id", name="uq_source_professions_source_id_profession_id"
        ),
    )
    op.create_index(
        "ix_source_professions_source_id",
        "source_professions",
        ["source_id"],
        unique=False,
    )
    op.create_index(
        "ix_source_professions_profession_id",
        "source_professions",
        ["profession_id"],
        unique=False,
    )

    # 2. On PostgreSQL only: ENABLE ROW LEVEL SECURITY with no policies (default-deny)
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("ALTER TABLE source_professions ENABLE ROW LEVEL SECURITY;"))


def downgrade() -> None:
    bind = op.get_bind()

    # 1. On PostgreSQL: Disable RLS before dropping
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("ALTER TABLE source_professions DISABLE ROW LEVEL SECURITY;"))

    # 2. Drop source_professions table
    op.drop_index("ix_source_professions_profession_id", table_name="source_professions")
    op.drop_index("ix_source_professions_source_id", table_name="source_professions")
    op.drop_table("source_professions")
