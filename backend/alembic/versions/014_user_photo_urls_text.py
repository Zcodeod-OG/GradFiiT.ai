"""Widen user URL columns to TEXT for person-photo / avatar URLs

Revision ID: 014_user_photo_urls_text
Revises: 013_garment_palette_attrs
Create Date: 2026-05-12

Some hosted Postgres setups end up with VARCHAR(n) caps on columns that were
added as generic VARCHAR without an explicit unlimited length. Long URLs,
presigned query strings, or JSON payloads derived from embeddings can exceed
those caps (users reported errors mentioning '6000 exceeded'). TEXT removes
the practical limit while staying compatible with existing data.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "014_user_photo_urls_text"
down_revision: Union[str, None] = "013_garment_palette_attrs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_URL_COLUMNS = (
    "default_person_image_url",
    "default_person_image_s3_key",
    "default_person_smart_crop_url",
    "default_person_face_url",
    "avatar_source_image_url",
    "avatar_model_url",
    "avatar_preview_url",
    "avatar_turntable_url",
)


def upgrade() -> None:
    for col in _URL_COLUMNS:
        op.alter_column(
            "users",
            col,
            existing_type=sa.String(),
            type_=sa.Text(),
            existing_nullable=True,
        )


def downgrade() -> None:
    for col in _URL_COLUMNS:
        op.alter_column(
            "users",
            col,
            existing_type=sa.Text(),
            type_=sa.String(),
            existing_nullable=True,
        )
