"""Remove the webshop-like auction transaction layer.

Revision ID: 0012_remove_auction_transactions
Revises: 0011_auction_transactions
Create Date: 2026-07-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0012_remove_auction_transactions"
down_revision: str | None = "0011_auction_transactions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("auction_transactions")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction', 'saved_search_match', 'report_resolved', 'report_dismissed', 'auction_moderation_action', 'auction_message')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction', 'saved_search_match', 'report_resolved', 'report_dismissed', 'auction_moderation_action')",
    )
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
