"""Add garment closet opt-in flag

Revision ID: 006_garment_closet_optin
Revises: 005_user_avatar_profile
Create Date: 2026-04-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "006_garment_closet_optin"
down_revision: Union[str, None] = "005_user_avatar_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "garments",
        sa.Column("saved_to_closet", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("garments", "saved_to_closet")
