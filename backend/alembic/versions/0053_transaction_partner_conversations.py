"""Add one shared conversation per seller-buyer pair.

Revision ID: 0053_partner_conversations
Revises: 0052_saved_search_types
"""
from alembic import op
import sqlalchemy as sa


revision = "0053_partner_conversations"
down_revision = "0052_saved_search_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("buyer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("seller_id <> buyer_id", name="ck_transaction_conversations_distinct_participants"),
        sa.UniqueConstraint("seller_id", "buyer_id", name="uq_transaction_conversations_participants"),
    )
    op.create_index("ix_transaction_conversations_seller_id", "transaction_conversations", ["seller_id"])
    op.create_index("ix_transaction_conversations_buyer_id", "transaction_conversations", ["buyer_id"])
    op.create_index("ix_transaction_conversations_participants", "transaction_conversations", ["seller_id", "buyer_id"])
    op.add_column("auction_transactions", sa.Column("conversation_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_auction_transactions_conversation_id",
        "auction_transactions",
        "transaction_conversations",
        ["conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_auction_transactions_conversation_id", "auction_transactions", ["conversation_id"])
    op.execute(
        """
        INSERT INTO transaction_conversations (seller_id, buyer_id)
        SELECT DISTINCT seller_id, buyer_id FROM auction_transactions
        ON CONFLICT (seller_id, buyer_id) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE auction_transactions AS transaction
        SET conversation_id = conversation.id
        FROM transaction_conversations AS conversation
        WHERE conversation.seller_id = transaction.seller_id
          AND conversation.buyer_id = transaction.buyer_id
        """
    )
    op.create_table(
        "transaction_conversation_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("transaction_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(trim(message)) > 0", name="ck_transaction_conversation_messages_not_empty"),
        sa.CheckConstraint("length(message) <= 2000", name="ck_transaction_conversation_messages_max_length"),
    )
    op.create_index("ix_transaction_conversation_messages_conversation_id", "transaction_conversation_messages", ["conversation_id"])
    op.create_index("ix_transaction_conversation_messages_sender_id", "transaction_conversation_messages", ["sender_id"])
    op.create_index("ix_transaction_conversation_messages_created", "transaction_conversation_messages", ["conversation_id", "created_at"])


def downgrade() -> None:
    op.drop_table("transaction_conversation_messages")
    op.drop_index("ix_auction_transactions_conversation_id", table_name="auction_transactions")
    op.drop_constraint("fk_auction_transactions_conversation_id", "auction_transactions", type_="foreignkey")
    op.drop_column("auction_transactions", "conversation_id")
    op.drop_table("transaction_conversations")
