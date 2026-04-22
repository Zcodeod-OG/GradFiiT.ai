"""Add Stripe billing columns, garment source_url, and affiliate_clicks

Revision ID: 009_billing_and_affiliate
Revises: 008_user_default_person_photo
Create Date: 2026-04-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009_billing_and_affiliate"
down_revision: Union[str, None] = "008_user_default_person_photo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Stripe billing on users ───────────────────────────────────────
    op.add_column(
        "users", sa.Column("stripe_customer_id", sa.String(), nullable=True)
    )
    op.create_index(
        "ix_users_stripe_customer_id",
        "users",
        ["stripe_customer_id"],
        unique=False,
    )
    op.add_column(
        "users", sa.Column("stripe_subscription_id", sa.String(), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_status",
            sa.String(),
            nullable=False,
            server_default="inactive",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_renews_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_cancel_at_period_end",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # ── Retailer source URL on garments ───────────────────────────────
    op.add_column(
        "garments", sa.Column("source_url", sa.String(), nullable=True)
    )

    # ── Affiliate click tracking table ────────────────────────────────
    op.create_table(
        "affiliate_clicks",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "garment_id",
            sa.Integer(),
            sa.ForeignKey("garments.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "tryon_id",
            sa.Integer(),
            sa.ForeignKey("tryons.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("network", sa.String(), nullable=False),
        sa.Column("merchant", sa.String(), nullable=True),
        sa.Column("original_url", sa.Text(), nullable=False),
        sa.Column("affiliate_url", sa.Text(), nullable=False),
        sa.Column(
            "is_conversion",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("conversion_value_usd", sa.String(), nullable=True),
        sa.Column(
            "conversion_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "clicked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("affiliate_clicks")
    op.drop_column("garments", "source_url")
    op.drop_column("users", "subscription_cancel_at_period_end")
    op.drop_column("users", "subscription_renews_at")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "stripe_subscription_id")
    op.drop_index("ix_users_stripe_customer_id", table_name="users")
    op.drop_column("users", "stripe_customer_id")
