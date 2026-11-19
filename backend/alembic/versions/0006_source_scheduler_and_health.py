"""Add scheduler lease, next_fetch_at, and health status columns to sources

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-19 16:00:00.000000

"""
from typing import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("sources") as batch_op:
        batch_op.add_column(
            sa.Column("status", sa.String(length=20), server_default="healthy", nullable=False)
        )
        batch_op.add_column(
            sa.Column("next_fetch_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("fetch_started_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index("ix_sources_next_fetch_at", ["next_fetch_at"], unique=False)
        batch_op.create_index("ix_sources_lease_expires_at", ["lease_expires_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("sources") as batch_op:
        batch_op.drop_index("ix_sources_lease_expires_at")
        batch_op.drop_index("ix_sources_next_fetch_at")
        batch_op.drop_column("fetch_started_at")
        batch_op.drop_column("lease_expires_at")
        batch_op.drop_column("next_fetch_at")
        batch_op.drop_column("status")
