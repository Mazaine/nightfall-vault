"""Allow fixed listings to reserve trade-folder inventory.

Revision ID: 0047_trade_backed_listings
Revises: 0046_batch_bundle_listings
"""

from alembic import op
import sqlalchemy as sa


revision = "0047_trade_backed_listings"
down_revision = "0046_batch_bundle_listings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("vault_trade_card_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_auctions_vault_trade_card_id", "auctions", "vault_trade_cards", ["vault_trade_card_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_auctions_vault_trade_card_id", "auctions", ["vault_trade_card_id"])
    op.add_column("auction_bundle_items", sa.Column("vault_trade_card_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_auction_bundle_items_vault_trade_card_id", "auction_bundle_items", "vault_trade_cards", ["vault_trade_card_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_auction_bundle_items_vault_trade_card_id", "auction_bundle_items", ["vault_trade_card_id"])
    op.create_unique_constraint("uq_auction_bundle_items_auction_trade_card", "auction_bundle_items", ["auction_id", "vault_trade_card_id"])


def downgrade() -> None:
    op.drop_constraint("uq_auction_bundle_items_auction_trade_card", "auction_bundle_items", type_="unique")
    op.drop_index("ix_auction_bundle_items_vault_trade_card_id", table_name="auction_bundle_items")
    op.drop_constraint("fk_auction_bundle_items_vault_trade_card_id", "auction_bundle_items", type_="foreignkey")
    op.drop_column("auction_bundle_items", "vault_trade_card_id")
    op.drop_index("ix_auctions_vault_trade_card_id", table_name="auctions")
    op.drop_constraint("fk_auctions_vault_trade_card_id", "auctions", type_="foreignkey")
    op.drop_column("auctions", "vault_trade_card_id")
