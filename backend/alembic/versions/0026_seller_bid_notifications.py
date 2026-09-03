"""add seller bid notification type

Revision ID: 0026_seller_bid_notifications
Revises: 0025_social_auth_identities
"""

from alembic import op

revision = "0026_seller_bid_notifications"
down_revision = "0025_social_auth_identities"
branch_labels = None
depends_on = None


OLD_TYPES = "('outbid','auction_won','auction_lost','auction_sold','auction_unsold','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder','bid_withdrawn_bidder','bid_withdrawn_seller','bid_leader_changed_after_withdrawal','bid_withdrawal_warning')"
NEW_TYPES = "('outbid','auction_bid_received','auction_won','auction_lost','auction_sold','auction_unsold','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder','bid_withdrawn_bidder','bid_withdrawn_seller','bid_leader_changed_after_withdrawal','bid_withdrawal_warning')"


def upgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", f"type IN {NEW_TYPES}")


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE type = 'auction_bid_received'")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", f"type IN {OLD_TYPES}")
