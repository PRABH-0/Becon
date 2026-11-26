"""Ensure daily_briefings foreign key has ON DELETE CASCADE

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            DECLARE
                r RECORD;
            BEGIN
                FOR r IN (
                    SELECT constraint_name
                    FROM information_schema.table_constraints
                    WHERE table_name = 'daily_briefings' AND constraint_type = 'FOREIGN KEY'
                ) LOOP
                    EXECUTE 'ALTER TABLE daily_briefings DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                END LOOP;
            END $$;
            """
        )
        op.create_foreign_key(
            "fk_daily_briefings_user_id_user_profiles",
            "daily_briefings",
            "user_profiles",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
    else:
        with op.batch_alter_table("daily_briefings") as batch_op:
            pass


def downgrade() -> None:
    pass
