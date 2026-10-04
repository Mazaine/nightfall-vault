"""Add the virtual HKK vault, VP ledger and trade negotiation tables.

Revision ID: 0033_virtual_hkk_vault
Revises: 0032_transaction_notes
"""

from alembic import op
import sqlalchemy as sa


revision = "0033_virtual_hkk_vault"
down_revision = "0032_transaction_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("vault_accounts",
        sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("base_collection_capacity", sa.Integer(), server_default="500", nullable=False),
        sa.Column("trade_capacity", sa.Integer(), server_default="200", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.CheckConstraint("base_collection_capacity >= 0", name="ck_vault_accounts_collection_capacity"),
        sa.CheckConstraint("trade_capacity >= 0", name="ck_vault_accounts_trade_capacity"), sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("user_id"))
    op.create_table("vault_folders",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("name", sa.String(80), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False), sa.Column("position", sa.Integer(), nullable=False), sa.Column("color", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("capacity >= 0", name="ck_vault_folders_capacity"), sa.CheckConstraint("position >= 0", name="ck_vault_folders_position"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("user_id", "name", name="uq_vault_folders_user_name"))
    op.create_index("ix_vault_folders_user_id", "vault_folders", ["user_id"])
    op.create_index("ix_vault_folders_user_position", "vault_folders", ["user_id", "position"])
    op.create_table("vault_collection_cards",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("folder_id", sa.Integer(), nullable=False),
        sa.Column("external_card_id", sa.String(120), nullable=False), sa.Column("card_name", sa.String(180), nullable=False), sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("edition", sa.String(120), nullable=True), sa.Column("card_type", sa.String(80), nullable=True), sa.Column("subtype", sa.String(120), nullable=True),
        sa.Column("color", sa.String(80), nullable=True), sa.Column("rarity", sa.String(80), nullable=True), sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("wanted", sa.Boolean(), server_default=sa.false(), nullable=False), sa.Column("wanted_quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("quantity BETWEEN 1 AND 3", name="ck_vault_collection_cards_quantity"), sa.CheckConstraint("wanted_quantity BETWEEN 0 AND 2", name="ck_vault_collection_cards_wanted_quantity"), sa.ForeignKeyConstraint(["folder_id"], ["vault_folders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("user_id", "external_card_id", name="uq_vault_collection_cards_user_card"))
    op.create_index("ix_vault_collection_cards_user_id", "vault_collection_cards", ["user_id"])
    op.create_index("ix_vault_collection_cards_folder_id", "vault_collection_cards", ["folder_id"])
    op.create_index("ix_vault_collection_cards_folder_name", "vault_collection_cards", ["folder_id", "card_name"])
    op.create_table("vault_trade_cards",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("external_card_id", sa.String(120), nullable=False),
        sa.Column("card_name", sa.String(180), nullable=False), sa.Column("image_url", sa.Text(), nullable=True), sa.Column("edition", sa.String(120), nullable=True),
        sa.Column("card_type", sa.String(80), nullable=True), sa.Column("subtype", sa.String(120), nullable=True), sa.Column("color", sa.String(80), nullable=True),
        sa.Column("rarity", sa.String(80), nullable=True), sa.Column("quantity", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.CheckConstraint("quantity BETWEEN 1 AND 3", name="ck_vault_trade_cards_quantity"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("user_id", "external_card_id", name="uq_vault_trade_cards_user_card"))
    op.create_index("ix_vault_trade_cards_user_id", "vault_trade_cards", ["user_id"])
    op.create_index("ix_vault_trade_cards_external_name", "vault_trade_cards", ["external_card_id", "card_name"])
    op.create_table("vault_point_transactions",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False), sa.Column("reference_type", sa.String(50), nullable=True), sa.Column("reference_id", sa.String(120), nullable=True),
        sa.Column("event_key", sa.String(180), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount <> 0", name="ck_vault_point_transactions_amount"), sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("user_id", "event_key", name="uq_vault_point_transactions_user_event"))
    op.create_index("ix_vault_point_transactions_user_id", "vault_point_transactions", ["user_id"])
    op.create_index("ix_vault_point_transactions_user_created", "vault_point_transactions", ["user_id", "created_at"])
    op.create_table("vault_capacity_grants",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("slots", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(40), nullable=False), sa.Column("reference_id", sa.String(120), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("slots > 0", name="ck_vault_capacity_grants_slots"), sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "source_type", "reference_id", name="uq_vault_capacity_grants_source"))
    op.create_index("ix_vault_capacity_grants_user_id", "vault_capacity_grants", ["user_id"])
    op.create_index("ix_vault_capacity_grants_user_created", "vault_capacity_grants", ["user_id", "created_at"])
    op.create_table("vault_trades",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("requester_id", sa.Integer(), nullable=False), sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("offered_card_id", sa.Integer(), nullable=False), sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("requester_confirmed_at", sa.DateTime(timezone=True), nullable=True), sa.Column("owner_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.CheckConstraint("requester_id <> owner_id", name="ck_vault_trades_distinct_users"),
        sa.CheckConstraint("status IN ('open', 'completed', 'cancelled')", name="ck_vault_trades_status"), sa.ForeignKeyConstraint(["offered_card_id"], ["vault_trade_cards.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["requester_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("requester_id", "offered_card_id", name="uq_vault_trades_requester_offer"))
    op.create_index("ix_vault_trades_requester_id", "vault_trades", ["requester_id"]); op.create_index("ix_vault_trades_owner_id", "vault_trades", ["owner_id"])
    op.create_index("ix_vault_trades_offered_card_id", "vault_trades", ["offered_card_id"]); op.create_index("ix_vault_trades_participants", "vault_trades", ["requester_id", "owner_id"])
    op.create_table("vault_trade_messages",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("trade_id", sa.Integer(), nullable=False), sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(message)) > 0", name="ck_vault_trade_messages_not_empty"), sa.CheckConstraint("length(message) <= 2000", name="ck_vault_trade_messages_max_length"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["trade_id"], ["vault_trades.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_vault_trade_messages_trade_id", "vault_trade_messages", ["trade_id"]); op.create_index("ix_vault_trade_messages_sender_id", "vault_trade_messages", ["sender_id"])
    op.create_index("ix_vault_trade_messages_trade_created", "vault_trade_messages", ["trade_id", "created_at"])
    op.create_table("vault_trade_reviews",
        sa.Column("id", sa.Integer(), nullable=False), sa.Column("trade_id", sa.Integer(), nullable=False), sa.Column("reviewer_id", sa.Integer(), nullable=False),
        sa.Column("reviewed_user_id", sa.Integer(), nullable=False), sa.Column("rating", sa.Integer(), nullable=False), sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_vault_trade_reviews_rating"),
        sa.CheckConstraint("reviewer_id <> reviewed_user_id", name="ck_vault_trade_reviews_distinct_users"), sa.CheckConstraint("comment IS NULL OR length(comment) <= 1000", name="ck_vault_trade_reviews_comment_length"),
        sa.ForeignKeyConstraint(["trade_id"], ["vault_trades.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("trade_id", "reviewer_id", name="uq_vault_trade_reviews_trade_reviewer"))
    op.create_index("ix_vault_trade_reviews_trade_id", "vault_trade_reviews", ["trade_id"]); op.create_index("ix_vault_trade_reviews_reviewer_id", "vault_trade_reviews", ["reviewer_id"])
    op.create_index("ix_vault_trade_reviews_reviewed_user_id", "vault_trade_reviews", ["reviewed_user_id"])


def downgrade() -> None:
    for table in ("vault_trade_reviews", "vault_trade_messages", "vault_trades", "vault_capacity_grants", "vault_point_transactions", "vault_trade_cards", "vault_collection_cards", "vault_folders", "vault_accounts"):
        op.drop_table(table)
