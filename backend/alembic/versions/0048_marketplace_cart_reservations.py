"""Add marketplace carts, expiring reservations and grouped transaction items.

Revision ID: 0048_marketplace_cart
Revises: 0047_trade_backed_listings
"""
from alembic import op
import sqlalchemy as sa

revision = "0048_marketplace_cart"
down_revision = "0047_trade_backed_listings"
branch_labels = None
depends_on = None

_OLD_NOTIFICATION_TYPES = "('outbid','auction_bid_received','auction_won','auction_lost','auction_sold','auction_unsold','seller_auction_reminder','seller_new_auction','saved_search_match','vault_match','report_resolved','report_dismissed','auction_moderation_action','auction_message','transaction_opened','transaction_confirmation','transaction_completed','moderation_action','moderation_strike','moderation_revoked','review_received','watchlist_reminder','bid_withdrawn_bidder','bid_withdrawn_seller','bid_leader_changed_after_withdrawal','bid_withdrawal_warning','auction_photo_requested','auction_photos_added')"
_NEW_NOTIFICATION_TYPES = _OLD_NOTIFICATION_TYPES[:-1] + ",'purchase_intent_created','purchase_intent_confirmed','transaction_cancelled')"


def upgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", f"type IN {_NEW_NOTIFICATION_TYPES}")
    op.drop_constraint("ck_auction_transactions_status", "auction_transactions", type_="check")
    op.create_check_constraint("ck_auction_transactions_status", "auction_transactions", "status IN ('transaction_open','completed','reviewed','archived','cancelled')")
    op.create_table("carts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_carts_user_id", "carts", ["user_id"], unique=True)
    op.create_table("cart_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_id", sa.Integer(), sa.ForeignKey("carts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("price_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("reservation_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_cart_items_quantity"),
        sa.CheckConstraint("status IN ('active', 'removed', 'checked_out')", name="ck_cart_items_status"),
        sa.CheckConstraint("price_snapshot > 0", name="ck_cart_items_price_snapshot"),
        sa.UniqueConstraint("cart_id", "auction_id", name="uq_cart_items_cart_auction"))
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"])
    op.create_index("ix_cart_items_auction_id", "cart_items", ["auction_id"])
    op.create_index("ix_cart_items_cart_status", "cart_items", ["cart_id", "status"])
    op.create_table("inventory_reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_item_id", sa.Integer(), sa.ForeignKey("cart_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_inventory_reservations_quantity"),
        sa.CheckConstraint("status IN ('active', 'expired', 'released', 'consumed')", name="ck_inventory_reservations_status"),
        sa.CheckConstraint("expires_at > starts_at", name="ck_inventory_reservations_window"),
        sa.UniqueConstraint("cart_item_id", name="uq_inventory_reservations_cart_item"))
    op.create_index("ix_inventory_reservations_cart_item_id", "inventory_reservations", ["cart_item_id"], unique=True)
    op.create_index("ix_inventory_reservations_auction_id", "inventory_reservations", ["auction_id"])
    op.create_index("ix_inventory_reservations_user_id", "inventory_reservations", ["user_id"])
    op.create_index("ix_inventory_reservations_expires_at", "inventory_reservations", ["expires_at"])
    op.create_index("ix_inventory_reservations_auction_active", "inventory_reservations", ["auction_id", "status", "expires_at"])
    op.create_table("checkout_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("buyer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("seller_count", sa.Integer(), nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("total_amount >= 0", name="ck_checkout_batches_total_amount"),
        sa.UniqueConstraint("buyer_id", "idempotency_key", name="uq_checkout_batches_buyer_key"))
    op.create_index("ix_checkout_batches_buyer_id", "checkout_batches", ["buyer_id"])
    op.add_column("auction_transactions", sa.Column("checkout_batch_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_auction_transactions_checkout_batch", "auction_transactions", "checkout_batches", ["checkout_batch_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_auction_transactions_checkout_batch_id", "auction_transactions", ["checkout_batch_id"])
    op.create_table("auction_transaction_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("auction_transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("title_snapshot", sa.String(180), nullable=False),
        sa.Column("inventory_deducted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_auction_transaction_items_quantity"),
        sa.CheckConstraint("unit_price > 0", name="ck_auction_transaction_items_unit_price"),
        sa.UniqueConstraint("transaction_id", "auction_id", name="uq_auction_transaction_items_transaction_auction"))
    op.create_index("ix_auction_transaction_items_transaction_id", "auction_transaction_items", ["transaction_id"])
    op.create_index("ix_auction_transaction_items_auction", "auction_transaction_items", ["auction_id"])


def downgrade() -> None:
    op.drop_constraint("ck_auction_transactions_status", "auction_transactions", type_="check")
    op.create_check_constraint("ck_auction_transactions_status", "auction_transactions", "status IN ('transaction_open','completed','reviewed','archived')")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", f"type IN {_OLD_NOTIFICATION_TYPES}")
    op.drop_table("auction_transaction_items")
    op.drop_index("ix_auction_transactions_checkout_batch_id", table_name="auction_transactions")
    op.drop_constraint("fk_auction_transactions_checkout_batch", "auction_transactions", type_="foreignkey")
    op.drop_column("auction_transactions", "checkout_batch_id")
    op.drop_table("checkout_batches")
    op.drop_table("inventory_reservations")
    op.drop_table("cart_items")
    op.drop_table("carts")
