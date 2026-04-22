"""Add POSTPROCESSING value to the tryonstatus enum

Revision ID: 007_tryon_postprocessing_status
Revises: 006_garment_closet_optin
Create Date: 2026-04-19
"""

from typing import Sequence, Union

from alembic import op


revision: str = "007_tryon_postprocessing_status"
down_revision: Union[str, None] = "006_garment_closet_optin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Postgres only -- the rest of the project assumes Postgres so we don't
# bother with a SQLite-compatible path. ALTER TYPE ... ADD VALUE is
# transactional-friendly when wrapped in IF NOT EXISTS, so this migration
# is safe to re-run against an environment where the value already exists.


def upgrade() -> None:
    op.execute(
        "ALTER TYPE tryonstatus ADD VALUE IF NOT EXISTS 'postprocessing'"
    )


def downgrade() -> None:
    # Postgres has no native ALTER TYPE ... DROP VALUE. Removing an enum
    # value requires recreating the type, which would force-cast every
    # row using it. Since this is a pure additive change with no data
    # implications we leave the value in place on downgrade. This keeps
    # rollbacks safe and idempotent.
    pass
