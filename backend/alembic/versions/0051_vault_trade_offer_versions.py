"""Add versioned multi-card Vault trade offers without changing existing trades.

Revision ID: 0051_vault_trade_offers
Revises: 0050_cart_no_reservations
"""
from alembic import op
import sqlalchemy as sa


revision = "0051_vault_trade_offers"
down_revision = "0050_cart_no_reservations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vault_trades", sa.Column("current_version", sa.Integer(), server_default="1", nullable=False))
    op.create_table(
        "vault_trade_offer_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("trade_id", sa.Integer(), sa.ForeignKey("vault_trades.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_vault_trade_offer_versions_version"),
        sa.UniqueConstraint("trade_id", "version", name="uq_vault_trade_offer_versions_trade_version"),
    )
    op.create_index("ix_vault_trade_offer_versions_trade_id", "vault_trade_offer_versions", ["trade_id"])
    op.create_index("ix_vault_trade_offer_versions_created_by_id", "vault_trade_offer_versions", ["created_by_id"])
    op.create_index("ix_vault_trade_offer_versions_trade_created", "vault_trade_offer_versions", ["trade_id", "created_at"])
    op.create_table(
        "vault_trade_offer_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("offer_version_id", sa.Integer(), sa.ForeignKey("vault_trade_offer_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("trade_card_id", sa.Integer(), sa.ForeignKey("vault_trade_cards.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("estimated_unit_price", sa.Integer(), nullable=True),
        sa.CheckConstraint("quantity BETWEEN 1 AND 9", name="ck_vault_trade_offer_items_quantity"),
        sa.UniqueConstraint("offer_version_id", "trade_card_id", name="uq_vault_trade_offer_items_version_card"),
    )
    op.create_index("ix_vault_trade_offer_items_offer_version_id", "vault_trade_offer_items", ["offer_version_id"])
    op.create_index("ix_vault_trade_offer_items_owner_id", "vault_trade_offer_items", ["owner_id"])
    op.create_index("ix_vault_trade_offer_items_trade_card_id", "vault_trade_offer_items", ["trade_card_id"])
    op.create_index("ix_vault_trade_offer_items_owner", "vault_trade_offer_items", ["owner_id", "trade_card_id"])
    op.create_table(
        "vault_trade_offer_acceptances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("offer_version_id", sa.Integer(), sa.ForeignKey("vault_trade_offer_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("offer_version_id", "user_id", name="uq_vault_trade_offer_acceptances_version_user"),
    )
    op.create_index("ix_vault_trade_offer_acceptances_offer_version_id", "vault_trade_offer_acceptances", ["offer_version_id"])
    op.create_index("ix_vault_trade_offer_acceptances_user_id", "vault_trade_offer_acceptances", ["user_id"])
    op.create_index("ix_vault_trade_offer_acceptances_user", "vault_trade_offer_acceptances", ["user_id", "accepted_at"])

    # Every legacy negotiation becomes version 1 with its original requested card.
    op.execute("""
        INSERT INTO vault_trade_offer_versions (trade_id, version, created_by_id, created_at)
        SELECT id, 1, requester_id, created_at FROM vault_trades
    """)
    op.execute("""
        INSERT INTO vault_trade_offer_items (offer_version_id, owner_id, trade_card_id, quantity)
        SELECT version.id, trade.owner_id, trade.offered_card_id, 1
        FROM vault_trades AS trade
        JOIN vault_trade_offer_versions AS version ON version.trade_id = trade.id AND version.version = 1
    """)


def downgrade() -> None:
    op.drop_table("vault_trade_offer_acceptances")
    op.drop_table("vault_trade_offer_items")
    op.drop_table("vault_trade_offer_versions")
    op.drop_column("vault_trades", "current_version")
