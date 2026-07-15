"""Add the Sprint 14 transaction lifecycle and moderation history.

Revision ID: 0013_transaction_moderation
Revises: 0012_remove_auction_transactions
Create Date: 2026-07-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0013_transaction_moderation"
down_revision: str | None = "0012_remove_auction_transactions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auction_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("buyer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="transaction_open"),
        sa.Column("seller_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("buyer_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("auction_id", name="uq_auction_transactions_auction"),
        sa.CheckConstraint("status IN ('transaction_open', 'completed', 'reviewed', 'archived')", name="ck_auction_transactions_status"),
        sa.CheckConstraint("seller_id <> buyer_id", name="ck_auction_transactions_distinct_participants"),
    )
    op.create_index("ix_auction_transactions_auction_id", "auction_transactions", ["auction_id"], unique=True)
    op.create_index("ix_auction_transactions_seller_id", "auction_transactions", ["seller_id"])
    op.create_index("ix_auction_transactions_buyer_id", "auction_transactions", ["buyer_id"])
    op.create_index("ix_auction_transactions_status", "auction_transactions", ["status"])
    op.create_index("ix_auction_transactions_review_deadline", "auction_transactions", ["review_deadline"])
    op.create_index("ix_auction_transactions_participants", "auction_transactions", ["seller_id", "buyer_id"])
    op.create_index("ix_auction_transactions_status_updated", "auction_transactions", ["status", "updated_at"])

    op.execute(
        """
        INSERT INTO auction_transactions (auction_id, seller_id, buyer_id, status, created_at, updated_at)
        SELECT id, seller_id, winner_id, 'transaction_open', COALESCE(finalized_at, created_at), now()
        FROM auctions
        WHERE status = 'sold' AND winner_id IS NOT NULL AND seller_id <> winner_id
        ON CONFLICT (auction_id) DO NOTHING
        """
    )

    op.create_table(
        "moderation_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action_type", sa.String(40), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column("created_by_admin_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_report_id", sa.Integer(), sa.ForeignKey("reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_admin_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("action_type IN ('warning', 'auction_creation_ban', 'bidding_ban', 'chat_ban', 'temporary_ban', 'permanent_ban')", name="ck_moderation_actions_type"),
        sa.CheckConstraint("expires_at IS NULL OR expires_at > starts_at", name="ck_moderation_actions_expiry"),
    )
    for column in ("target_user_id", "action_type", "created_by_admin_id", "source_report_id", "expires_at"):
        op.create_index(f"ix_moderation_actions_{column}", "moderation_actions", [column])
    op.create_index("ix_moderation_actions_target_active", "moderation_actions", ["target_user_id", "action_type", "expires_at", "revoked_at"])

    op.create_table(
        "user_strikes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("source_report_id", sa.Integer(), sa.ForeignKey("reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issued_by_admin_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_admin_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint("severity IN ('low', 'medium', 'high', 'critical')", name="ck_user_strikes_severity"),
    )
    for column in ("user_id", "source_report_id", "issued_by_admin_id", "expires_at"):
        op.create_index(f"ix_user_strikes_{column}", "user_strikes", [column])
    op.create_index("ix_user_strikes_user_active", "user_strikes", ["user_id", "expires_at", "revoked_at"])

    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction', 'saved_search_match', 'report_resolved', 'report_dismissed', 'auction_moderation_action', 'auction_message', 'transaction_opened', 'transaction_confirmation', 'transaction_completed', 'moderation_action', 'moderation_strike', 'moderation_revoked')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction', 'saved_search_match', 'report_resolved', 'report_dismissed', 'auction_moderation_action', 'auction_message')",
    )
    op.drop_table("user_strikes")
    op.drop_table("moderation_actions")
    op.drop_table("auction_transactions")
