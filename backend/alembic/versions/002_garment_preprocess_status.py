"""Add garment preprocessing status columns

Revision ID: 002_garment_preprocess_status
Revises: 001_pipeline_columns
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "002_garment_preprocess_status"
down_revision: Union[str, None] = "001_pipeline_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "garments",
        sa.Column("preprocess_status", sa.String(), nullable=False, server_default="pending"),
    )
    op.add_column(
        "garments",
        sa.Column("preprocess_error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("garments", "preprocess_error")
    op.drop_column("garments", "preprocess_status")
