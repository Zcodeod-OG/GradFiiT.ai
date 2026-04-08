"""Add subscription tiers and 3D try-on fields

Revision ID: 004_subscription_and_3d_tryon
Revises: 003_tryon_queue_reliability
Create Date: 2026-04-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "004_subscription_and_3d_tryon"
down_revision: Union[str, None] = "003_tryon_queue_reliability"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("subscription_tier", sa.String(), nullable=False, server_default="free_2d"),
    )
    op.add_column(
        "users",
        sa.Column("preferred_tryon_mode", sa.String(), nullable=False, server_default="2d"),
    )

    op.add_column(
        "tryons",
        sa.Column("tryon_mode", sa.String(), nullable=False, server_default="2d"),
    )
    op.add_column("tryons", sa.Column("result_model_url", sa.String(), nullable=True))
    op.add_column("tryons", sa.Column("result_turntable_url", sa.String(), nullable=True))

    op.execute("ALTER TYPE tryonstatus ADD VALUE IF NOT EXISTS 'avatar_3d_generating'")
    op.execute("ALTER TYPE tryonstatus ADD VALUE IF NOT EXISTS 'garment_fitting_3d'")
    op.execute("ALTER TYPE tryonstatus ADD VALUE IF NOT EXISTS 'model_rendering_3d'")


def downgrade() -> None:
    op.drop_column("tryons", "result_turntable_url")
    op.drop_column("tryons", "result_model_url")
    op.drop_column("tryons", "tryon_mode")

    op.drop_column("users", "preferred_tryon_mode")
    op.drop_column("users", "subscription_tier")
