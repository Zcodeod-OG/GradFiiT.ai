"""Add tryon queue reliability and telemetry columns

Revision ID: 003_tryon_queue_reliability
Revises: 002_garment_preprocess_status
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "003_tryon_queue_reliability"
down_revision: Union[str, None] = "002_garment_preprocess_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tryons",
        sa.Column("lifecycle_status", sa.String(), nullable=False, server_default="queued"),
    )
    op.add_column("tryons", sa.Column("idempotency_key", sa.String(), nullable=True))
    op.create_index("ix_tryons_idempotency_key", "tryons", ["idempotency_key"], unique=False)
    op.add_column("tryons", sa.Column("worker_task_id", sa.String(), nullable=True))
    op.add_column("tryons", sa.Column("queue_enqueued_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tryons", sa.Column("queue_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tryons", sa.Column("execution_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tryons", sa.Column("execution_finished_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tryons", sa.Column("queue_wait_ms", sa.Integer(), nullable=True))
    op.add_column("tryons", sa.Column("execution_ms", sa.Integer(), nullable=True))
    op.add_column("tryons", sa.Column("total_latency_ms", sa.Integer(), nullable=True))


    op.execute("ALTER TYPE tryonstatus ADD VALUE IF NOT EXISTS 'queued'")
    op.execute("ALTER TYPE tryonstatus ADD VALUE IF NOT EXISTS 'dead_letter'")


def downgrade() -> None:
    op.drop_column("tryons", "total_latency_ms")
    op.drop_column("tryons", "execution_ms")
    op.drop_column("tryons", "queue_wait_ms")
    op.drop_column("tryons", "execution_finished_at")
    op.drop_column("tryons", "execution_started_at")
    op.drop_column("tryons", "queue_started_at")
    op.drop_column("tryons", "queue_enqueued_at")
    op.drop_column("tryons", "worker_task_id")
    op.drop_index("ix_tryons_idempotency_key", table_name="tryons")
    op.drop_column("tryons", "idempotency_key")
    op.drop_column("tryons", "lifecycle_status")
