"""Add 5-stage pipeline columns to tryons and garments tables

Revision ID: 001_pipeline_columns
Revises: None
Create Date: 2026-03-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001_pipeline_columns"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- tryons table: new columns for 5-stage pipeline --
    op.add_column("tryons", sa.Column("extracted_garment_url", sa.String(), nullable=True))
    op.add_column("tryons", sa.Column("quality_gate_score", sa.Float(), nullable=True))
    op.add_column("tryons", sa.Column("quality_gate_passed", sa.Boolean(), nullable=True))
    op.add_column("tryons", sa.Column("rating_score", sa.Float(), nullable=True))

    # -- garments table: extraction + classification columns --
    op.add_column("garments", sa.Column("extracted_image_url", sa.String(), nullable=True))
    op.add_column("garments", sa.Column("extracted_s3_key", sa.String(), nullable=True))
    op.add_column("garments", sa.Column("garment_type", sa.String(), nullable=True))


def downgrade() -> None:
    # -- garments table --
    op.drop_column("garments", "garment_type")
    op.drop_column("garments", "extracted_s3_key")
    op.drop_column("garments", "extracted_image_url")

    # -- tryons table --
    op.drop_column("tryons", "rating_score")
    op.drop_column("tryons", "quality_gate_passed")
    op.drop_column("tryons", "quality_gate_score")
    op.drop_column("tryons", "extracted_garment_url")
