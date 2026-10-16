"""Add idempotent auction photo requests and notification types.

Revision ID: 0045_auction_photo_requests
Revises: 0044_auction_reserve_price
"""

from alembic import op
import sqlalchemy as sa


revision = "0045_auction_photo_requests"
down_revision = "0044_auction_reserve_price"
branch_labels = None
depends_on = None


_OLD_TYPES = "('outbid','auction_bid_received','auction_won','auction_lost','auction_sold','auction_unsold','seller_auction_reminder','seller_new_auction','saved_search_match','vault_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder','bid_withdrawn_bidder','bid_withdrawn_seller','bid_leader_changed_after_withdrawal','bid_withdrawal_warning')"
_NEW_TYPES = _OLD_TYPES[:-1] + ",'auction_photo_requested','auction_photos_added')"


def upgrade() -> None:
    op.create_table(
        "auction_photo_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requester_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("auction_id", "requester_id", name="uq_auction_photo_requests_auction_requester"),
    )
    op.create_index("ix_auction_photo_requests_auction_id", "auction_photo_requests", ["auction_id"])
    op.create_index("ix_auction_photo_requests_requester_id", "auction_photo_requests", ["requester_id"])
    op.create_index("ix_auction_photo_requests_pending", "auction_photo_requests", ["auction_id", "fulfilled_at"])
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", f"type IN {_NEW_TYPES}")


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", f"type IN {_OLD_TYPES}")
    op.drop_table("auction_photo_requests")
