"""Add persistent 3D avatar profile fields to users

Revision ID: 005_user_avatar_profile
Revises: 004_subscription_and_3d_tryon
Create Date: 2026-04-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "005_user_avatar_profile"
down_revision: Union[str, None] = "004_subscription_and_3d_tryon"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_status", sa.String(), nullable=False, server_default="not_started"),
    )
    op.add_column("users", sa.Column("avatar_source_image_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("avatar_model_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("avatar_model_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("avatar_preview_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("avatar_turntable_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("avatar_metadata", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("avatar_error_message", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_updated_at")
    op.drop_column("users", "avatar_error_message")
    op.drop_column("users", "avatar_metadata")
    op.drop_column("users", "avatar_turntable_url")
    op.drop_column("users", "avatar_preview_url")
    op.drop_column("users", "avatar_model_url")
    op.drop_column("users", "avatar_model_id")
    op.drop_column("users", "avatar_source_image_url")
    op.drop_column("users", "avatar_status")
