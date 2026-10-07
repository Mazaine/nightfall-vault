"""Add virtual vault decks.

Revision ID: 0039_vault_decks
Revises: 0038_vault_variants_loans
"""

from alembic import op
import sqlalchemy as sa


revision = "0039_vault_decks"
down_revision = "0038_vault_variants_loans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vault_decks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_vault_decks_name"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_vault_decks_user_name"),
    )
    op.create_index("ix_vault_decks_user_id", "vault_decks", ["user_id"])
    op.create_index("ix_vault_decks_user_updated", "vault_decks", ["user_id", "updated_at"])
    op.create_table(
        "vault_deck_cards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deck_id", sa.Integer(), nullable=False),
        sa.Column("external_card_id", sa.String(length=120), nullable=False),
        sa.Column("card_name", sa.String(length=180), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("edition", sa.String(length=120), nullable=True),
        sa.Column("required_quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("required_quantity BETWEEN 1 AND 99", name="ck_vault_deck_cards_quantity"),
        sa.ForeignKeyConstraint(["deck_id"], ["vault_decks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("deck_id", "external_card_id", name="uq_vault_deck_cards_deck_card"),
    )
    op.create_index("ix_vault_deck_cards_deck_id", "vault_deck_cards", ["deck_id"])
    op.create_index("ix_vault_deck_cards_deck_name", "vault_deck_cards", ["deck_id", "card_name"])


def downgrade() -> None:
    op.drop_table("vault_deck_cards")
    op.drop_table("vault_decks")
