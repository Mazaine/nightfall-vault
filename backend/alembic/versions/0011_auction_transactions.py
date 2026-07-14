"""Add the Sprint 12 auction transaction lifecycle.

Revision ID: 0011_auction_transactions
Revises: 0010_sprint11_baseline_contract
Create Date: 2026-07-13
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0011_auction_transactions"
down_revision: str | None = "0010_sprint11_baseline_contract"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auction_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("buyer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="awaiting_arrangement"),
        sa.Column("seller_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("buyer_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispute_opened_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("dispute_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("auction_id", name="uq_auction_transactions_auction"),
        sa.CheckConstraint(
            "status IN ('awaiting_arrangement', 'in_progress', 'completed', 'disputed', 'cancelled')",
            name="ck_auction_transactions_status",
        ),
        sa.CheckConstraint("seller_id <> buyer_id", name="ck_auction_transactions_distinct_participants"),
        sa.CheckConstraint("amount > 0", name="ck_auction_transactions_amount_positive"),
    )
    op.create_index("ix_auction_transactions_auction_id", "auction_transactions", ["auction_id"], unique=True)
    op.create_index("ix_auction_transactions_seller_id", "auction_transactions", ["seller_id"])
    op.create_index("ix_auction_transactions_buyer_id", "auction_transactions", ["buyer_id"])
    op.create_index("ix_auction_transactions_status", "auction_transactions", ["status"])
    op.create_index("ix_auction_transactions_dispute_opened_by_id", "auction_transactions", ["dispute_opened_by_id"])
    op.create_index("ix_auction_transactions_created_at", "auction_transactions", ["created_at"])

    op.execute(
        """
        INSERT INTO auction_transactions (auction_id, seller_id, buyer_id, amount, status, created_at, updated_at)
        SELECT id, seller_id, winner_id, current_price, 'awaiting_arrangement',
               COALESCE(finalized_at, created_at), COALESCE(finalized_at, updated_at)
        FROM auctions
        WHERE status = 'sold' AND winner_id IS NOT NULL AND seller_id <> winner_id
        ON CONFLICT (auction_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("auction_transactions")
