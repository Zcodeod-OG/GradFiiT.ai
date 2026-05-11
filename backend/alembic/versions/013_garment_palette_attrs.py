"""Garment palette + attributes for outfit recommender

Revision ID: 013_garment_palette_attrs
Revises: 012_tryon_preview_image_url
Create Date: 2026-05-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "013_garment_palette_attrs"
down_revision: Union[str, None] = "012_tryon_preview_image_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dominant color palette extracted from the garment image on
    # preprocess. List of {hex, weight} dicts; weight sums to ~1.0.
    op.add_column(
        "garments",
        sa.Column("color_palette", sa.JSON(), nullable=True),
    )
    # Timestamp of the last successful palette extraction. Lets us
    # invalidate / re-run when the extraction algorithm changes.
    op.add_column(
        "garments",
        sa.Column(
            "palette_extracted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # Open-ended attribute bag for future enrichment (LLM tags, fabric,
    # season, etc.). Nullable; consumers must tolerate missing keys.
    op.add_column(
        "garments",
        sa.Column("attributes", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("garments", "attributes")
    op.drop_column("garments", "palette_extracted_at")
    op.drop_column("garments", "color_palette")
