"""Studios v1: tryon.source + designs/outfits/brand_dnas tables

Revision ID: 010_studios_and_brand_dna
Revises: 009_billing_and_affiliate
Create Date: 2026-04-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "010_studios_and_brand_dna"
down_revision: Union[str, None] = "009_billing_and_affiliate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── tryons.source ─────────────────────────────────────────────────
    # Plain string column (not a Postgres ENUM) so the Provider Router
    # can grow new values (e.g. "ios", "android") without a migration.
    op.add_column(
        "tryons",
        sa.Column(
            "source",
            sa.String(),
            nullable=False,
            server_default="web",
        ),
    )
    op.create_index("ix_tryons_source", "tryons", ["source"], unique=False)

    # ── designs ───────────────────────────────────────────────────────
    op.create_table(
        "designs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("negative_prompt", sa.Text(), nullable=True),
        sa.Column("sketch_image_url", sa.String(), nullable=True),
        sa.Column("style_reference_url", sa.String(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=False, server_default="1024"),
        sa.Column("height", sa.Integer(), nullable=False, server_default="1024"),
        sa.Column("guidance_scale", sa.Float(), nullable=False, server_default="4.5"),
        sa.Column(
            "num_inference_steps",
            sa.Integer(),
            nullable=False,
            server_default="35",
        ),
        sa.Column("num_images", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("seed", sa.Integer(), nullable=True),
        sa.Column("lora_uri", sa.String(), nullable=True),
        sa.Column("lora_scale", sa.Float(), nullable=True),
        sa.Column("primary_image_url", sa.String(), nullable=True),
        sa.Column("image_urls", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("saved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("inference_id", sa.String(), nullable=True, index=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("pipeline_metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── outfits ───────────────────────────────────────────────────────
    op.create_table(
        "outfits",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("pieces", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("background", sa.String(), nullable=False, server_default="studio"),
        sa.Column("model_reference_url", sa.String(), nullable=True),
        sa.Column("seed", sa.Integer(), nullable=True),
        sa.Column("num_images", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("lora_uri", sa.String(), nullable=True),
        sa.Column("lora_scale", sa.Integer(), nullable=True),
        sa.Column("primary_image_url", sa.String(), nullable=True),
        sa.Column("image_urls", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("saved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("inference_id", sa.String(), nullable=True, index=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("pipeline_metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── brand_dnas ────────────────────────────────────────────────────
    op.create_table(
        "brand_dnas",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("palette", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("logos", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("model_references", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("voice", sa.Text(), nullable=True),
        sa.Column("lora_uri", sa.String(), nullable=True),
        sa.Column("lora_status", sa.String(), nullable=False, server_default="none"),
        sa.Column(
            "lora_strength",
            sa.Float(),
            nullable=False,
            server_default="1.0",
        ),
        sa.Column("lora_metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("brand_dnas")
    op.drop_table("outfits")
    op.drop_table("designs")
    op.drop_index("ix_tryons_source", table_name="tryons")
    op.drop_column("tryons", "source")
