"""migrate notification preferences from categories to event keys

Revision ID: 0031_event_preferences
Revises: 0030_web_push_delivery
"""

from alembic import op


revision = "0031_event_preferences"
down_revision = "0030_web_push_delivery"
branch_labels = None
depends_on = None


EVENT_SOURCES = {
    "outbid": "bids",
    "auction_bid_received": "bids",
    "auction_won": "transactions",
    "auction_lost": "transactions",
    "auction_sold": "transactions",
    "auction_unsold": "transactions",
    "watchlist_reminder": "system",
    "seller_auction_reminder": "system",
    "transaction_updates": "transactions",
    "auction_message": "chat",
    "seller_new_auction": "follows",
    "review_received": "reviews",
    "bid_updates": "bids",
}


def upgrade() -> None:
    op.drop_constraint("ck_notification_preferences_category", "notification_preferences", type_="check")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid','auction_bid_received','auction_won','auction_lost','auction_sold','auction_unsold','seller_auction_reminder','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder','bid_withdrawn_bidder','bid_withdrawn_seller','bid_leader_changed_after_withdrawal','bid_withdrawal_warning')",
    )
    for event_key, source_category in EVENT_SOURCES.items():
        op.execute(
            "INSERT INTO notification_preferences (user_id, category, in_app, browser, email, push) "
            f"SELECT user_id, '{event_key}', in_app, browser, email, push FROM notification_preferences WHERE category = '{source_category}' "
            "ON CONFLICT (user_id, category) DO NOTHING"
        )
    op.execute("DELETE FROM notification_preferences WHERE category IN ('bids','chat','follows','transactions','reviews')")
    op.create_check_constraint(
        "ck_notification_preferences_category",
        "notification_preferences",
        "category IN ('outbid','auction_bid_received','auction_won','auction_lost','auction_sold','auction_unsold','watchlist_reminder','seller_auction_reminder','transaction_updates','auction_message','seller_new_auction','review_received','bid_updates','moderation','system')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notification_preferences_category", "notification_preferences", type_="check")
    for category, source_keys in {
        "bids": ("outbid", "auction_bid_received", "bid_updates"),
        "chat": ("auction_message",),
        "follows": ("seller_new_auction",),
        "transactions": ("auction_won", "auction_lost", "auction_sold", "auction_unsold", "transaction_updates"),
        "reviews": ("review_received",),
    }.items():
        quoted = ",".join(f"'{key}'" for key in source_keys)
        op.execute(
            "INSERT INTO notification_preferences (user_id, category, in_app, browser, email, push) "
            f"SELECT user_id, '{category}', bool_or(in_app), bool_or(browser), bool_or(email), bool_or(push) "
            f"FROM notification_preferences WHERE category IN ({quoted}) GROUP BY user_id "
            "ON CONFLICT (user_id, category) DO NOTHING"
        )
    op.execute("DELETE FROM notification_preferences WHERE category NOT IN ('bids','chat','follows','transactions','reviews','moderation','system')")
    op.create_check_constraint(
        "ck_notification_preferences_category",
        "notification_preferences",
        "category IN ('bids','chat','follows','transactions','reviews','moderation','system')",
    )
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.execute("DELETE FROM notifications WHERE type = 'seller_auction_reminder'")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid','auction_bid_received','auction_won','auction_lost','auction_sold','auction_unsold','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder','bid_withdrawn_bidder','bid_withdrawn_seller','bid_leader_changed_after_withdrawal','bid_withdrawal_warning')",
    )
