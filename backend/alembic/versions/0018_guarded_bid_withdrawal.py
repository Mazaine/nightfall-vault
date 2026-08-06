"""Add guarded bid withdrawal state and user abuse counters.

Revision ID: 0018_guarded_bid_withdrawal
Revises: 0017_auth_session_version
Create Date: 2026-08-06
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0018_guarded_bid_withdrawal"
down_revision: str | None = "0017_auth_session_version"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid','auction_won','auction_lost','auction_sold','auction_unsold','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder','bid_withdrawn_bidder','bid_withdrawn_seller','bid_leader_changed_after_withdrawal','bid_withdrawal_warning')",
    )
    op.add_column("bids", sa.Column("status", sa.String(length=20), server_default="active", nullable=False))
    op.add_column("bids", sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bids", sa.Column("withdrawal_reason_code", sa.String(length=40), nullable=True))
    op.add_column("bids", sa.Column("withdrawal_reason_text", sa.Text(), nullable=True))
    op.add_column("bids", sa.Column("withdrawn_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_bids_withdrawn_by_user_id", "bids", "users", ["withdrawn_by_user_id"], ["id"], ondelete="SET NULL")
    op.create_check_constraint("ck_bids_status", "bids", "status IN ('active', 'withdrawn')")
    op.create_index("ix_bids_status", "bids", ["status"])
    op.create_index("ix_bids_auction_status_rank", "bids", ["auction_id", "status", "amount", "created_at", "id"])

    op.add_column("users", sa.Column("bid_withdrawal_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("bid_withdrawal_warning_level", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("bid_withdrawal_first_warning_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_bid_withdrawal_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("bid_withdrawal_disabled_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("bid_withdrawal_permanently_disabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index("ix_users_bid_withdrawal_disabled_until", "users", ["bid_withdrawal_disabled_until"])


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid','auction_won','auction_lost','auction_sold','auction_unsold','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder')",
    )
    op.drop_index("ix_users_bid_withdrawal_disabled_until", table_name="users")
    for column in (
        "bid_withdrawal_permanently_disabled", "bid_withdrawal_disabled_until", "last_bid_withdrawal_at",
        "bid_withdrawal_first_warning_sent_at", "bid_withdrawal_warning_level", "bid_withdrawal_count",
    ):
        op.drop_column("users", column)
    op.drop_index("ix_bids_auction_status_rank", table_name="bids")
    op.drop_index("ix_bids_status", table_name="bids")
    op.drop_constraint("ck_bids_status", "bids", type_="check")
    op.drop_constraint("fk_bids_withdrawn_by_user_id", "bids", type_="foreignkey")
    for column in ("withdrawn_by_user_id", "withdrawal_reason_text", "withdrawal_reason_code", "withdrawn_at", "status"):
        op.drop_column("bids", column)
