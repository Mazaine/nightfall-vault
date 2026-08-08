"""add VIP reminders and auction links

Revision ID: 0023_vip_reminders_links
Revises: 0022_demo_auction_batches
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_vip_reminders_links"
down_revision = "0022_demo_auction_batches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("vip_reminder_one_day", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("vip_reminder_one_hour", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("vip_reminder_five_minutes", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("auctions", sa.Column("external_link_label", sa.String(length=80), nullable=True))
    op.add_column("auctions", sa.Column("external_link_url", sa.String(length=1000), nullable=True))
    op.drop_constraint("ck_watchlist_reminders_minutes", "watchlist_reminders", type_="check")
    op.create_check_constraint("ck_watchlist_reminders_minutes", "watchlist_reminders", "minutes_before IN (1, 5, 10, 30, 60, 1440)")


def downgrade() -> None:
    op.execute("DELETE FROM watchlist_reminders WHERE minutes_before IN (60, 1440)")
    op.drop_constraint("ck_watchlist_reminders_minutes", "watchlist_reminders", type_="check")
    op.create_check_constraint("ck_watchlist_reminders_minutes", "watchlist_reminders", "minutes_before IN (1, 5, 10, 30)")
    op.drop_column("auctions", "external_link_url")
    op.drop_column("auctions", "external_link_label")
    op.drop_column("users", "vip_reminder_five_minutes")
    op.drop_column("users", "vip_reminder_one_hour")
    op.drop_column("users", "vip_reminder_one_day")
