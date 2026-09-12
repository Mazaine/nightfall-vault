"""add user device web push subscriptions

Revision ID: 0029_web_push_subscriptions
Revises: 0028_notification_outbox
"""

from alembic import op
import sqlalchemy as sa


revision = "0029_web_push_subscriptions"
down_revision = "0028_notification_outbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "web_push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.String(length=2048), nullable=False),
        sa.Column("p256dh", sa.String(length=512), nullable=False),
        sa.Column("auth", sa.String(length=256), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("endpoint LIKE 'https://%'", name="ck_web_push_subscriptions_https_endpoint"),
        sa.CheckConstraint("length(p256dh) BETWEEN 40 AND 512", name="ck_web_push_subscriptions_p256dh_length"),
        sa.CheckConstraint("length(auth) BETWEEN 8 AND 256", name="ck_web_push_subscriptions_auth_length"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", name="uq_web_push_subscriptions_endpoint"),
    )
    op.create_index("ix_web_push_subscriptions_user_active", "web_push_subscriptions", ["user_id", "revoked_at"])


def downgrade() -> None:
    op.drop_index("ix_web_push_subscriptions_user_active", table_name="web_push_subscriptions")
    op.drop_table("web_push_subscriptions")
