"""add web push delivery channel

Revision ID: 0030_web_push_delivery
Revises: 0029_web_push_subscriptions
"""

from alembic import op
import sqlalchemy as sa


revision = "0030_web_push_delivery"
down_revision = "0029_web_push_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notification_preferences", sa.Column("push", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("notifications", sa.Column("push_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("notification_outbox", sa.Column("web_push_subscription_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_notification_outbox_web_push_subscription_id",
        "notification_outbox",
        "web_push_subscriptions",
        ["web_push_subscription_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_notification_outbox_web_push_subscription_id",
        "notification_outbox",
        ["web_push_subscription_id"],
    )
    op.drop_constraint("ck_notification_outbox_task_type", "notification_outbox", type_="check")
    op.create_check_constraint(
        "ck_notification_outbox_task_type",
        "notification_outbox",
        "task_type IN ('realtime','email','push')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM notification_outbox WHERE task_type = 'push'")
    op.drop_constraint("ck_notification_outbox_task_type", "notification_outbox", type_="check")
    op.create_check_constraint(
        "ck_notification_outbox_task_type",
        "notification_outbox",
        "task_type IN ('realtime','email')",
    )
    op.drop_index("ix_notification_outbox_web_push_subscription_id", table_name="notification_outbox")
    op.drop_constraint("fk_notification_outbox_web_push_subscription_id", "notification_outbox", type_="foreignkey")
    op.drop_column("notification_outbox", "web_push_subscription_id")
    op.drop_column("notifications", "push_enabled")
    op.drop_column("notification_preferences", "push")
