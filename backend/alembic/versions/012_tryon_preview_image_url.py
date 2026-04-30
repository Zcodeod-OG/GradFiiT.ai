"""Add preview_image_url to tryons (streaming preview)

Revision ID: 012_tryon_preview_image_url
Revises: 011_create_looks
Create Date: 2026-04-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "012_tryon_preview_image_url"
down_revision: Union[str, None] = "011_create_looks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tryons",
        sa.Column("preview_image_url", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tryons", "preview_image_url")
