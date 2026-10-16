"""Add optional private auction reserve price.

Revision ID: 0044_auction_reserve_price
Revises: 0043_vault_marketplace_listing
"""

from alembic import op
import sqlalchemy as sa


revision = "0044_auction_reserve_price"
down_revision = "0043_vault_marketplace_listing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("reserve_price", sa.Numeric(12, 2), nullable=True))
    op.create_check_constraint("ck_auctions_reserve_price_minimum", "auctions", "reserve_price IS NULL OR reserve_price >= starting_price")
    op.create_check_constraint("ck_auctions_reserve_price_buy_now", "auctions", "reserve_price IS NULL OR buy_now_price IS NULL OR reserve_price <= buy_now_price")


def downgrade() -> None:
    op.drop_constraint("ck_auctions_reserve_price_buy_now", "auctions", type_="check")
    op.drop_constraint("ck_auctions_reserve_price_minimum", "auctions", type_="check")
    op.drop_column("auctions", "reserve_price")
