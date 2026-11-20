"""Allow unvalidated status in cards.validation_status

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-20 17:30:00.000000

"""
from typing import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("cards") as batch_op:
        batch_op.drop_constraint("ck_cards_validation_status", type_="check")
        batch_op.create_check_constraint(
            "ck_cards_validation_status",
            "validation_status IN ('pending', 'passed', 'failed', 'flagged', 'unvalidated')",
        )


def downgrade() -> None:
    with op.batch_alter_table("cards") as batch_op:
        batch_op.drop_constraint("ck_cards_validation_status", type_="check")
        batch_op.create_check_constraint(
            "ck_cards_validation_status",
            "validation_status IN ('pending', 'passed', 'failed', 'flagged')",
        )
