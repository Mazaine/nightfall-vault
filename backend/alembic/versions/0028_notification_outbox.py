"""add transactional notification outbox

Revision ID: 0028_notification_outbox
Revises: 0027_hatalom_auction_eras
"""

from alembic import op
import sqlalchemy as sa


revision = "0028_notification_outbox"
down_revision = "0027_hatalom_auction_eras"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_outbox",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notification_id", sa.Integer(), nullable=False),
        sa.Column("event_key", sa.String(length=220), nullable=False),
        sa.Column("task_type", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=120), nullable=True),
        sa.CheckConstraint("task_type IN ('realtime','email')", name="ck_notification_outbox_task_type"),
        sa.CheckConstraint("status IN ('pending','processing','retry','delivered','failed')", name="ck_notification_outbox_status"),
        sa.ForeignKeyConstraint(["notification_id"], ["notifications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_key", "task_type", name="uq_notification_outbox_event_task"),
    )
    op.create_index("ix_notification_outbox_notification_id", "notification_outbox", ["notification_id"])
    op.create_index("ix_notification_outbox_due", "notification_outbox", ["status", "next_attempt_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_notification_outbox_due", table_name="notification_outbox")
    op.drop_index("ix_notification_outbox_notification_id", table_name="notification_outbox")
    op.drop_table("notification_outbox")
