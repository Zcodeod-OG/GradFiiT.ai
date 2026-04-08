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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    # Bootstrap base schema for fresh databases where no pre-Alembic tables exist.
    if "users" not in table_names:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("hashed_password", sa.String(), nullable=False),
            sa.Column("full_name", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.text("true")),
            sa.Column("is_superuser", sa.Boolean(), nullable=True, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    if "garments" not in table_names:
        op.create_table(
            "garments",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("image_url", sa.String(), nullable=False),
            sa.Column("s3_key", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    if "tryons" not in table_names:
        tryon_status = sa.Enum(
            "pending",
            "garment_extracting",
            "garment_extracted",
            "stage1_processing",
            "stage1_completed",
            "quality_checking",
            "quality_passed",
            "quality_failed",
            "stage2_processing",
            "rating_computing",
            "completed",
            "failed",
            name="tryonstatus",
        )
        op.create_table(
            "tryons",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("garment_id", sa.Integer(), sa.ForeignKey("garments.id"), nullable=False),
            sa.Column("person_image_url", sa.String(), nullable=False),
            sa.Column("garment_image_url", sa.String(), nullable=True),
            sa.Column("status", tryon_status, nullable=True, server_default=sa.text("'pending'")),
            sa.Column("stage1_prediction_id", sa.String(), nullable=True),
            sa.Column("stage1_result_url", sa.String(), nullable=True),
            sa.Column("stage2_prediction_id", sa.String(), nullable=True),
            sa.Column("result_image_url", sa.String(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("pipeline_metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    inspector = sa.inspect(bind)

    def _has_column(table_name: str, column_name: str) -> bool:
        return any(c["name"] == column_name for c in inspector.get_columns(table_name))

    # -- tryons table: new columns for 5-stage pipeline --
    if not _has_column("tryons", "extracted_garment_url"):
        op.add_column("tryons", sa.Column("extracted_garment_url", sa.String(), nullable=True))
    if not _has_column("tryons", "quality_gate_score"):
        op.add_column("tryons", sa.Column("quality_gate_score", sa.Float(), nullable=True))
    if not _has_column("tryons", "quality_gate_passed"):
        op.add_column("tryons", sa.Column("quality_gate_passed", sa.Boolean(), nullable=True))
    if not _has_column("tryons", "rating_score"):
        op.add_column("tryons", sa.Column("rating_score", sa.Float(), nullable=True))

    # -- garments table: extraction + classification columns --
    if not _has_column("garments", "extracted_image_url"):
        op.add_column("garments", sa.Column("extracted_image_url", sa.String(), nullable=True))
    if not _has_column("garments", "extracted_s3_key"):
        op.add_column("garments", sa.Column("extracted_s3_key", sa.String(), nullable=True))
    if not _has_column("garments", "garment_type"):
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
