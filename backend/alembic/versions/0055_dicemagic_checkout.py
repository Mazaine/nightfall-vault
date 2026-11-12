"""Scoped shop quantities, existing transaction linkage and durable mixed checkout.

No historical transaction or quantity is rewritten.
"""
from alembic import op
import sqlalchemy as sa

revision = "0055_dicemagic_checkout"
down_revision = "0054_dicemagic"
branch_labels = None
depends_on = None


def upgrade():
    for table, constraint in [("cart_items", "ck_cart_items_quantity"), ("auction_transaction_items", "ck_auction_transaction_items_quantity")]:
        op.add_column(table, sa.Column("shop_source", sa.String(30), nullable=True))
        op.drop_constraint(constraint, table, type_="check")
        op.create_check_constraint(constraint, table, "(shop_source IS NULL AND quantity BETWEEN 1 AND 9) OR (shop_source IS NOT NULL AND shop_source = 'dicemagic' AND quantity BETWEEN 1 AND 999)")
    op.execute("UPDATE cart_items c SET shop_source = 'dicemagic' FROM auctions a WHERE c.auction_id = a.id AND a.shop_source = 'dicemagic'")
    op.add_column("dicemagic_orders", sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("auction_transactions.id"), unique=True))
    op.add_column("dicemagic_orders", sa.Column("last_sent_at", sa.DateTime(timezone=True)))
    op.add_column("dicemagic_products", sa.Column("stock_ceiling", sa.Integer()))
    op.add_column("dicemagic_products", sa.Column("snapshot_generated_at", sa.DateTime(timezone=True)))
    op.create_table("dicemagic_order_holds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("dicemagic_orders.id"), nullable=False, index=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("dicemagic_products.id"), nullable=False, index=True),
        sa.Column("quantity", sa.Integer(), nullable=False), sa.Column("baseline_stock", sa.Integer()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)), sa.Column("resolved_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("evidence", sa.JSON()), sa.UniqueConstraint("order_id", "product_id", name="uq_dicemagic_order_product_hold"))
    op.create_table("dicemagic_checkout_attempts",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("buyer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False), sa.Column("private_item_ids", sa.JSON(), nullable=False),
        sa.Column("private_snapshots", sa.JSON(), nullable=False), sa.Column("shop_item_ids", sa.JSON(), nullable=False),
        sa.Column("shop_snapshots", sa.JSON(), nullable=False),
        sa.Column("private_result", sa.JSON()), sa.Column("private_error", sa.String(300)),
        sa.Column("shop_order_id", sa.Integer(), sa.ForeignKey("dicemagic_orders.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("buyer_id", "idempotency_key", name="uq_dicemagic_checkout_attempt"))
    # Legacy prepared orders remain conservatively blocked until explicit review.
    op.execute("""INSERT INTO dicemagic_order_holds (order_id, product_id, quantity, baseline_stock)
        SELECT o.id, p.id, (line->>'quantity')::integer, p.stock
        FROM dicemagic_orders o CROSS JOIN LATERAL json_array_elements(o.payload->'items') line
        JOIN dicemagic_products p ON p.outer_id = line->>'outer_id' AND p.shop_id = 'dicemagic'
        ON CONFLICT DO NOTHING""")


def downgrade():
    # Refuse lossy downgrades if new shop quantities cannot fit the old constraints.
    connection = op.get_bind()
    for table in ["dicemagic_checkout_attempts", "dicemagic_order_holds"]:
        if connection.scalar(sa.text(f"SELECT count(*) FROM {table}")):
            raise RuntimeError("Cannot downgrade: persistent DiceMagic checkout/hold records exist. Restore a verified backup instead.")
    if connection.scalar(sa.text("SELECT count(*) FROM dicemagic_orders WHERE transaction_id IS NOT NULL")):
        raise RuntimeError("Cannot downgrade: linked DiceMagic transactions exist.")
    for table in ["cart_items", "auction_transaction_items"]:
        if connection.scalar(sa.text(f"SELECT count(*) FROM {table} WHERE quantity > 9")):
            raise RuntimeError("Cannot downgrade: shop quantities above 9 exist.")
    op.drop_table("dicemagic_checkout_attempts")
    op.drop_table("dicemagic_order_holds")
    op.drop_column("dicemagic_orders", "transaction_id")
    op.drop_column("dicemagic_orders", "last_sent_at")
    op.drop_column("dicemagic_products", "snapshot_generated_at")
    op.drop_column("dicemagic_products", "stock_ceiling")
    for table, constraint in [("cart_items", "ck_cart_items_quantity"), ("auction_transaction_items", "ck_auction_transaction_items_quantity")]:
        op.drop_constraint(constraint, table, type_="check")
        op.drop_column(table, "shop_source")
        op.create_check_constraint(constraint, table, "quantity BETWEEN 1 AND 9")
