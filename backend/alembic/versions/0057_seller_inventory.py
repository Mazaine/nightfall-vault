"""Seller inventory provenance; quantities stay on existing auctions."""
from alembic import op
import sqlalchemy as sa

revision = "0057_seller_inventory"
down_revision = "0056_dicemagic_lifetime_vip"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("auctions", sa.Column("stock_managed", sa.Boolean(), nullable=False, server_default=sa.false()))
    for table, name, condition in [
        ("auctions", "ck_auctions_vault_quantity", "vault_quantity IS NULL OR (vault_quantity BETWEEN 0 AND 2147483647 AND ((listing_type = 'fixed' AND vault_collection_card_id IS NULL AND vault_trade_card_id IS NULL) OR vault_quantity BETWEEN 1 AND 9))"),
        ("cart_items", "ck_cart_items_quantity", "(shop_source IS NULL AND quantity BETWEEN 1 AND 2147483647) OR (shop_source = 'dicemagic' AND quantity BETWEEN 1 AND 999)"),
        ("auction_transaction_items", "ck_auction_transaction_items_quantity", "(shop_source IS NULL AND quantity BETWEEN 1 AND 2147483647) OR (shop_source = 'dicemagic' AND quantity BETWEEN 1 AND 999)"),
        ("inventory_reservations", "ck_inventory_reservations_quantity", "quantity BETWEEN 1 AND 2147483647"),
    ]:
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, condition)
    op.create_table("seller_stock_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("mapping", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "name", name="uq_seller_stock_source_name"))
    op.create_index("ix_seller_stock_sources_user_id", "seller_stock_sources", ["user_id"])
    op.create_table("seller_stock_links",
        sa.Column("listing_id", sa.Integer(), sa.ForeignKey("auctions.id"), primary_key=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("seller_stock_sources.id"), nullable=False),
        sa.Column("identity", sa.String(64), nullable=False),
        sa.Column("last_row", sa.JSON(), nullable=False))
    op.create_index("ix_seller_stock_links_source_id", "seller_stock_links", ["source_id"])
    op.create_index("ix_seller_stock_links_identity", "seller_stock_links", ["identity"])
    op.create_table("seller_stock_operations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("seller_stock_sources.id")),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False), sa.Column("rows", sa.JSON(), nullable=False), sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    for field in ("user_id", "source_id", "fingerprint"):
        op.create_index(f"ix_seller_stock_operations_{field}", "seller_stock_operations", [field])
    op.create_table("seller_hkk_catalog_cards", sa.Column("card_id", sa.String(120), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))


def downgrade():
    connection = op.get_bind()
    for table in ("seller_stock_sources", "seller_stock_links", "seller_stock_operations", "seller_hkk_catalog_cards"):
        if connection.scalar(sa.text(f"SELECT count(*) FROM {table}")):
            raise RuntimeError("Seller inventory data exists; refusing destructive downgrade.")
    if connection.scalar(sa.text("SELECT count(*) FROM auctions WHERE stock_managed OR vault_quantity = 0 OR vault_quantity > 9")):
        raise RuntimeError("Seller stock cannot fit the previous schema.")
    for table in ("cart_items", "auction_transaction_items", "inventory_reservations"):
        where = "quantity > 9" if table == "inventory_reservations" else "shop_source IS NULL AND quantity > 9"
        if connection.scalar(sa.text(f"SELECT count(*) FROM {table} WHERE {where}")):
            raise RuntimeError("Existing quantities cannot fit the previous schema.")
    for table in ("seller_stock_operations", "seller_stock_links", "seller_stock_sources", "seller_hkk_catalog_cards"):
        op.drop_table(table)
    op.drop_column("auctions", "stock_managed")
    for table, name, condition in [
        ("auctions", "ck_auctions_vault_quantity", "vault_quantity IS NULL OR vault_quantity BETWEEN 1 AND 9"),
        ("inventory_reservations", "ck_inventory_reservations_quantity", "quantity BETWEEN 1 AND 9"),
        ("cart_items", "ck_cart_items_quantity", "(shop_source IS NULL AND quantity BETWEEN 1 AND 9) OR (shop_source = 'dicemagic' AND quantity BETWEEN 1 AND 999)"),
        ("auction_transaction_items", "ck_auction_transaction_items_quantity", "(shop_source IS NULL AND quantity BETWEEN 1 AND 9) OR (shop_source = 'dicemagic' AND quantity BETWEEN 1 AND 999)"),
    ]:
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, condition)
