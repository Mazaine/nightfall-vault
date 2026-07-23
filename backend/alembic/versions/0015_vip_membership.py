"""Add VIP membership and activation codes.

Revision ID: 0015_vip_membership
Revises: 0014_realtime_notifications
Create Date: 2026-07-23
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0015_vip_membership"
down_revision: str | None = "0014_realtime_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("vip_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_vip_expires_at", "users", ["vip_expires_at"])
    op.create_table(
        "vip_activation_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_digest", sa.String(64), nullable=False),
        sa.Column("code_last_four", sa.String(4), nullable=False),
        sa.Column("duration_months", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.String(36), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("redeemed_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("duration_months IN (1, 3)", name="ck_vip_activation_codes_duration"),
    )
    op.create_index("ix_vip_activation_codes_code_digest", "vip_activation_codes", ["code_digest"], unique=True)
    op.create_index("ix_vip_activation_codes_batch_id", "vip_activation_codes", ["batch_id"])
    op.create_index("ix_vip_activation_codes_created_by_admin_id", "vip_activation_codes", ["created_by_admin_id"])
    op.create_index("ix_vip_activation_codes_redeemed_by_user_id", "vip_activation_codes", ["redeemed_by_user_id"])
    op.create_index("ix_vip_activation_codes_batch_created", "vip_activation_codes", ["batch_id", "created_at"])


def downgrade() -> None:
    op.drop_table("vip_activation_codes")
    op.drop_index("ix_users_vip_expires_at", table_name="users")
    op.drop_column("users", "vip_expires_at")
