"""DiceMagic snapshots, admin controls and durable order outbox."""
from alembic import op
import sqlalchemy as sa

revision = "0054_dicemagic"
down_revision = "0053_partner_conversations"
branch_labels = None
depends_on = None


def upgrade():
    for name, kind in [("shop_source", sa.String(30)), ("shop_stock", sa.Integer()), ("shop_image_url", sa.String(1000)), ("shop_edition", sa.String(255)), ("shop_variant", sa.String(30)), ("shop_regular_price", sa.Integer())]:
        op.add_column("auctions", sa.Column(name, kind))
    op.create_index("ix_auctions_shop_source", "auctions", ["shop_source"])
    op.create_table("dicemagic_state", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("sync_enabled", sa.Boolean(), nullable=False), sa.Column("orders_enabled", sa.Boolean(), nullable=False), sa.Column("last_sync_at", sa.DateTime(timezone=True)), sa.Column("last_error", sa.String(200)), sa.Column("summary", sa.JSON(), nullable=False))
    op.create_table("dicemagic_products", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("shop_id", sa.String(30), nullable=False), sa.Column("outer_id", sa.String(255), nullable=False), sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id"), unique=True, nullable=False), sa.Column("snapshot", sa.JSON(), nullable=False), sa.Column("stock", sa.Integer()), sa.Column("stock_blocked", sa.Boolean(), nullable=False), sa.Column("active", sa.Boolean(), nullable=False), sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.UniqueConstraint("shop_id", "outer_id", name="uq_dicemagic_shop_outer"))
    op.create_table("dicemagic_orders", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("buyer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("idempotency_key", sa.String(80), nullable=False), sa.Column("external_order_id", sa.String(80), unique=True, nullable=False), sa.Column("status", sa.String(30), nullable=False), sa.Column("payload", sa.JSON(), nullable=False), sa.Column("cart_item_ids", sa.JSON(), nullable=False), sa.Column("response", sa.JSON()), sa.Column("error", sa.String(100)), sa.Column("attempts", sa.Integer(), nullable=False), sa.Column("next_attempt_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.UniqueConstraint("buyer_id", "idempotency_key", name="uq_dicemagic_buyer_key"))
    op.create_table("dicemagic_sync_logs", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("summary", sa.JSON(), nullable=False))


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM dicemagic_orders")):
        raise RuntimeError("Cannot downgrade: persistent DiceMagic orders exist. Restore a verified backup instead.")
    for table in ["dicemagic_sync_logs", "dicemagic_orders", "dicemagic_products", "dicemagic_state"]:
        op.drop_table(table)
    op.drop_index("ix_auctions_shop_source", table_name="auctions")
    for name in ["shop_source", "shop_stock", "shop_image_url", "shop_edition", "shop_variant", "shop_regular_price"]:
        op.drop_column("auctions", name)
