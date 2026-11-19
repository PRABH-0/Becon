"""Add raw_metadata JSON column to raw_items

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-19 15:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    portable_json = sa.JSON().with_variant(postgresql.JSONB, "postgresql")
    op.add_column("raw_items", sa.Column("raw_metadata", portable_json, nullable=True))


def downgrade() -> None:
    op.drop_column("raw_items", "raw_metadata")
