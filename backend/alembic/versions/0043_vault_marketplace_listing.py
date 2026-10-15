"""Link marketplace listings to Vault inventory.

Revision ID: 0043_vault_marketplace_listing
Revises: 0042_teddy_vault_unlimited
"""

from alembic import op
import sqlalchemy as sa


revision = "0043_vault_marketplace_listing"
down_revision = "0042_teddy_vault_unlimited"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("listing_type", sa.String(length=16), nullable=False, server_default="auction"))
    op.add_column("auctions", sa.Column("vault_collection_card_id", sa.Integer(), nullable=True))
    op.add_column("auctions", sa.Column("vault_external_card_id", sa.String(length=120), nullable=True))
    op.add_column("auctions", sa.Column("vault_print_variant", sa.String(length=10), nullable=True))
    op.add_column("auctions", sa.Column("vault_quantity", sa.Integer(), nullable=True))
    op.add_column("auctions", sa.Column("vault_inventory_deducted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_foreign_key("fk_auctions_vault_collection_card", "auctions", "vault_collection_cards", ["vault_collection_card_id"], ["id"], ondelete="SET NULL")
    op.create_check_constraint("ck_auctions_listing_type", "auctions", "listing_type IN ('auction', 'fixed')")
    op.create_check_constraint("ck_auctions_vault_quantity", "auctions", "vault_quantity IS NULL OR vault_quantity BETWEEN 1 AND 9")
    op.create_index("ix_auctions_listing_type", "auctions", ["listing_type"])
    op.create_index("ix_auctions_vault_collection_card_id", "auctions", ["vault_collection_card_id"])
    op.create_index("ix_auctions_vault_external_card_id", "auctions", ["vault_external_card_id"])


def downgrade() -> None:
    op.drop_index("ix_auctions_vault_external_card_id", table_name="auctions")
    op.drop_index("ix_auctions_vault_collection_card_id", table_name="auctions")
    op.drop_index("ix_auctions_listing_type", table_name="auctions")
    op.drop_constraint("ck_auctions_vault_quantity", "auctions", type_="check")
    op.drop_constraint("ck_auctions_listing_type", "auctions", type_="check")
    op.drop_constraint("fk_auctions_vault_collection_card", "auctions", type_="foreignkey")
    for column in ("vault_inventory_deducted", "vault_quantity", "vault_print_variant", "vault_external_card_id", "vault_collection_card_id", "listing_type"):
        op.drop_column("auctions", column)
