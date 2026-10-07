"""Allow per-variant vault entries and add card loan tracking.

Revision ID: 0038_vault_variants_loans
Revises: 0037_vault_card_print_variant
"""

from alembic import op
import sqlalchemy as sa


revision = "0038_vault_variants_loans"
down_revision = "0037_vault_card_print_variant"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_vault_collection_cards_user_card", "vault_collection_cards", type_="unique")
    op.create_unique_constraint(
        "uq_vault_collection_cards_user_card_variant",
        "vault_collection_cards",
        ["user_id", "external_card_id", "print_variant"],
    )
    op.drop_constraint("uq_vault_trade_cards_user_card", "vault_trade_cards", type_="unique")
    op.create_unique_constraint(
        "uq_vault_trade_cards_user_card_variant",
        "vault_trade_cards",
        ["user_id", "external_card_id", "print_variant"],
    )

    op.create_table(
        "vault_card_loans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("collection_card_id", sa.Integer(), nullable=True),
        sa.Column("borrower_user_id", sa.Integer(), nullable=True),
        sa.Column("external_card_id", sa.String(length=120), nullable=False),
        sa.Column("card_name", sa.String(length=180), nullable=False),
        sa.Column("print_variant", sa.String(length=10), server_default="normal", nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("borrower_name", sa.String(length=180), nullable=False),
        sa.Column("lent_at", sa.Date(), nullable=False),
        sa.Column("due_at", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("quantity BETWEEN 1 AND 3", name="ck_vault_card_loans_quantity"),
        sa.CheckConstraint("status IN ('active', 'returned', 'cancelled')", name="ck_vault_card_loans_status"),
        sa.CheckConstraint("length(trim(borrower_name)) > 0", name="ck_vault_card_loans_borrower_name"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["borrower_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["collection_card_id"], ["vault_collection_cards.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vault_card_loans_user_id", "vault_card_loans", ["user_id"])
    op.create_index("ix_vault_card_loans_collection_card_id", "vault_card_loans", ["collection_card_id"])
    op.create_index("ix_vault_card_loans_borrower_user_id", "vault_card_loans", ["borrower_user_id"])
    op.create_index("ix_vault_card_loans_user_status", "vault_card_loans", ["user_id", "status"])
    op.create_index("ix_vault_card_loans_card_status", "vault_card_loans", ["collection_card_id", "status"])


def downgrade() -> None:
    op.drop_table("vault_card_loans")

    # Multiple variants cannot be represented by the previous schema. Keep the
    # highest quantity row for every user/card pair before restoring uniqueness.
    op.execute(
        """
        DELETE FROM vault_collection_cards a
        USING vault_collection_cards b
        WHERE a.user_id = b.user_id
          AND a.external_card_id = b.external_card_id
          AND (a.quantity < b.quantity OR (a.quantity = b.quantity AND a.id > b.id))
        """
    )
    op.execute(
        """
        DELETE FROM vault_trade_cards a
        USING vault_trade_cards b
        WHERE a.user_id = b.user_id
          AND a.external_card_id = b.external_card_id
          AND (a.quantity < b.quantity OR (a.quantity = b.quantity AND a.id > b.id))
        """
    )
    op.drop_constraint("uq_vault_collection_cards_user_card_variant", "vault_collection_cards", type_="unique")
    op.create_unique_constraint("uq_vault_collection_cards_user_card", "vault_collection_cards", ["user_id", "external_card_id"])
    op.drop_constraint("uq_vault_trade_cards_user_card_variant", "vault_trade_cards", type_="unique")
    op.create_unique_constraint("uq_vault_trade_cards_user_card", "vault_trade_cards", ["user_id", "external_card_id"])
