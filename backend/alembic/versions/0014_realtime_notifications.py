"""Add Sprint 16 realtime notification data.

Revision ID: 0014_realtime_notifications
Revises: 0013_transaction_moderation
Create Date: 2026-07-16
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0014_realtime_notifications"
down_revision: str | None = "0013_transaction_moderation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("category", sa.String(30), nullable=False, server_default="system"))
    op.add_column("notifications", sa.Column("target_url", sa.String(500), nullable=True))
    op.add_column("notifications", sa.Column("event_key", sa.String(180), nullable=True))
    op.add_column("notifications", sa.Column("in_app_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("notifications", sa.Column("browser_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("notifications", sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_unique_constraint("uq_notifications_event_key", "notifications", ["event_key"])
    op.execute("UPDATE notifications SET target_url = '/auctions/' || auction_id WHERE auction_id IS NOT NULL")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", "type IN ('outbid','auction_won','auction_lost','auction_sold','auction_unsold','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder')")

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("in_app", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("browser", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("email", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("category IN ('bids','chat','follows','transactions','reviews','moderation','system')", name="ck_notification_preferences_category"),
        sa.UniqueConstraint("user_id", "category", name="uq_notification_preferences_user_category"),
    )
    op.create_index("ix_notification_preferences_user_id", "notification_preferences", ["user_id"])

    op.create_table(
        "watchlist_reminders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("minutes_before", sa.Integer(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("minutes_before IN (1,5,10,30)", name="ck_watchlist_reminders_minutes"),
        sa.UniqueConstraint("user_id", "auction_id", "minutes_before", name="uq_watchlist_reminders_once"),
    )
    op.create_index("ix_watchlist_reminders_user_id", "watchlist_reminders", ["user_id"])
    op.create_index("ix_watchlist_reminders_auction_id", "watchlist_reminders", ["auction_id"])
    op.create_index("ix_watchlist_reminders_due", "watchlist_reminders", ["sent_at", "minutes_before"])
    op.execute("INSERT INTO watchlist_reminders (user_id, auction_id, minutes_before) SELECT w.user_id, w.auction_id, m.minutes_before FROM watchlist_items w CROSS JOIN (VALUES (30),(10),(5),(1)) AS m(minutes_before)")


def downgrade() -> None:
    op.drop_table("watchlist_reminders")
    op.drop_table("notification_preferences")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", "type IN ('outbid','auction_won','auction_lost','auction_sold','auction_unsold','seller_new_auction','saved_search_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked')")
    op.drop_constraint("uq_notifications_event_key", "notifications", type_="unique")
    for column in ("email_enabled", "browser_enabled", "in_app_enabled", "event_key", "target_url", "category"):
        op.drop_column("notifications", column)
