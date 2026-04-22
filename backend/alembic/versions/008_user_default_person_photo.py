"""Add persistent default person photo fields to users

Revision ID: 008_user_default_person_photo
Revises: 007_tryon_postprocessing_status
Create Date: 2026-04-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008_user_default_person_photo"
down_revision: Union[str, None] = "007_tryon_postprocessing_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("default_person_image_url", sa.String(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("default_person_image_s3_key", sa.String(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("default_person_smart_crop_url", sa.String(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("default_person_face_url", sa.String(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("default_person_face_embedding", sa.JSON(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("default_person_input_gate_metrics", sa.JSON(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "default_person_uploaded_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "default_person_uploaded_at")
    op.drop_column("users", "default_person_input_gate_metrics")
    op.drop_column("users", "default_person_face_embedding")
    op.drop_column("users", "default_person_face_url")
    op.drop_column("users", "default_person_smart_crop_url")
    op.drop_column("users", "default_person_image_s3_key")
    op.drop_column("users", "default_person_image_url")
