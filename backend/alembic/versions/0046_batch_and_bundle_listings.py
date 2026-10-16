"""Add atomic batch and bundle fixed-price listings.

Revision ID: 0046_batch_bundle_listings
Revises: 0045_auction_photo_requests
"""

from alembic import op
import sqlalchemy as sa


revision = "0046_batch_bundle_listings"
down_revision = "0045_auction_photo_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("batch_key", sa.String(length=36), nullable=True))
    op.add_column("auctions", sa.Column("listing_format", sa.String(length=16), nullable=False, server_default="single"))
    op.create_index("ix_auctions_batch_key", "auctions", ["batch_key"])
    op.create_index("ix_auctions_listing_format", "auctions", ["listing_format"])
    op.create_check_constraint("ck_auctions_listing_format", "auctions", "listing_format IN ('single', 'bundle')")
    op.create_table(
        "auction_bundle_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vault_collection_card_id", sa.Integer(), sa.ForeignKey("vault_collection_cards.id", ondelete="SET NULL"), nullable=True),
        sa.Column("external_card_id", sa.String(length=120), nullable=False),
        sa.Column("card_name", sa.String(length=180), nullable=False),
        sa.Column("edition", sa.String(length=180), nullable=True),
        sa.Column("image_url", sa.String(length=1000), nullable=True),
        sa.Column("print_variant", sa.String(length=10), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_auction_bundle_items_quantity"),
        sa.CheckConstraint("unit_price > 0", name="ck_auction_bundle_items_unit_price"),
        sa.CheckConstraint("print_variant IN ('normal', 'foil', 'fa', 'gfa')", name="ck_auction_bundle_items_variant"),
        sa.UniqueConstraint("auction_id", "vault_collection_card_id", name="uq_auction_bundle_items_auction_card"),
    )
    op.create_index("ix_auction_bundle_items_auction_id", "auction_bundle_items", ["auction_id"])
    op.create_index("ix_auction_bundle_items_vault_collection_card_id", "auction_bundle_items", ["vault_collection_card_id"])
    op.create_index("ix_auction_bundle_items_external_card_id", "auction_bundle_items", ["external_card_id"])
    op.create_index("ix_auction_bundle_items_external", "auction_bundle_items", ["external_card_id", "card_name"])


def downgrade() -> None:
    op.drop_table("auction_bundle_items")
    op.drop_constraint("ck_auctions_listing_format", "auctions", type_="check")
    op.drop_index("ix_auctions_listing_format", table_name="auctions")
    op.drop_index("ix_auctions_batch_key", table_name="auctions")
    op.drop_column("auctions", "listing_format")
    op.drop_column("auctions", "batch_key")
