"""Add participant-private transaction notes and list visibility.

Revision ID: 0032_transaction_notes
Revises: 0031_event_preferences
"""

from alembic import op
import sqlalchemy as sa


revision = "0032_transaction_notes"
down_revision = "0031_event_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auction_transactions", sa.Column("seller_note", sa.Text(), nullable=True))
    op.add_column("auction_transactions", sa.Column("buyer_note", sa.Text(), nullable=True))
    op.add_column("auction_transactions", sa.Column("seller_hidden_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("auction_transactions", sa.Column("buyer_hidden_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("auction_transactions", "buyer_hidden_at")
    op.drop_column("auction_transactions", "seller_hidden_at")
    op.drop_column("auction_transactions", "buyer_note")
    op.drop_column("auction_transactions", "seller_note")
