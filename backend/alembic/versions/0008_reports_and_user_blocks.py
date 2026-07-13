"""Add reports and user blocks.

Revision ID: 0008_reports_and_user_blocks
Revises: 0007_profiles_and_follows
Create Date: 2026-07-13
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0008_reports_and_user_blocks"
down_revision: str | None = "0007_profiles_and_follows"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reporter_id", sa.Integer(), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("auction_id", sa.Integer(), nullable=True),
        sa.Column("reported_user_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.String(length=80), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("assigned_admin_id", sa.Integer(), nullable=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("public_resolution", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("target_type IN ('auction', 'user')", name="ck_reports_target_type"),
        sa.CheckConstraint("status IN ('open', 'under_review', 'resolved', 'dismissed')", name="ck_reports_status"),
        sa.CheckConstraint("priority IN ('low', 'normal', 'high', 'urgent')", name="ck_reports_priority"),
        sa.CheckConstraint("(target_type = 'auction' AND auction_id IS NOT NULL) OR (target_type = 'user' AND auction_id IS NULL AND reported_user_id IS NOT NULL)", name="ck_reports_target_integrity"),
        sa.ForeignKeyConstraint(["assigned_admin_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["auction_id"], ["auctions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reported_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reports_assigned_admin_id", "reports", ["assigned_admin_id"])
    op.create_index("ix_reports_auction_id", "reports", ["auction_id"])
    op.create_index("ix_reports_created_at", "reports", ["created_at"])
    op.create_index("ix_reports_priority", "reports", ["priority"])
    op.create_index("ix_reports_reason", "reports", ["reason"])
    op.create_index("ix_reports_reported_user_id", "reports", ["reported_user_id"])
    op.create_index("ix_reports_reporter_id", "reports", ["reporter_id"])
    op.create_index("ix_reports_reporter_target_status", "reports", ["reporter_id", "target_type", "auction_id", "reported_user_id", "status"])
    op.create_index("ix_reports_status", "reports", ["status"])
    op.create_index("ix_reports_status_priority", "reports", ["status", "priority"])
    op.create_index("ix_reports_target", "reports", ["target_type", "auction_id", "reported_user_id"])

    op.create_table(
        "user_blocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("blocker_id", sa.Integer(), nullable=False),
        sa.Column("blocked_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("blocker_id <> blocked_id", name="ck_user_blocks_no_self_block"),
        sa.ForeignKeyConstraint(["blocked_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocker_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_user_blocks_blocker_blocked"),
    )
    op.create_index("ix_user_blocks_blocked_id", "user_blocks", ["blocked_id"])
    op.create_index("ix_user_blocks_blocker_id", "user_blocks", ["blocker_id"])

    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction', 'report_resolved', 'report_dismissed', 'auction_moderation_action')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction')",
    )
    op.drop_index("ix_user_blocks_blocker_id", table_name="user_blocks")
    op.drop_index("ix_user_blocks_blocked_id", table_name="user_blocks")
    op.drop_table("user_blocks")
    op.drop_index("ix_reports_target", table_name="reports")
    op.drop_index("ix_reports_status_priority", table_name="reports")
    op.drop_index("ix_reports_status", table_name="reports")
    op.drop_index("ix_reports_reporter_target_status", table_name="reports")
    op.drop_index("ix_reports_reporter_id", table_name="reports")
    op.drop_index("ix_reports_reported_user_id", table_name="reports")
    op.drop_index("ix_reports_reason", table_name="reports")
    op.drop_index("ix_reports_priority", table_name="reports")
    op.drop_index("ix_reports_created_at", table_name="reports")
    op.drop_index("ix_reports_auction_id", table_name="reports")
    op.drop_index("ix_reports_assigned_admin_id", table_name="reports")
    op.drop_table("reports")
