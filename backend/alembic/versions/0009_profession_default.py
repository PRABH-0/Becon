"""Add is_default to professions

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("professions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_default",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("professions") as batch_op:
        batch_op.drop_column("is_default")
