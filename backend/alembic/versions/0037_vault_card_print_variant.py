"""Add print variant markers to vault cards.

Revision ID: 0037_vault_card_print_variant
Revises: 0036_initial_vault_capacity_1000
"""

from alembic import op
import sqlalchemy as sa


revision = "0037_vault_card_print_variant"
down_revision = "0036_initial_vault_capacity_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("vault_collection_cards", "vault_trade_cards"):
        op.add_column(table, sa.Column("print_variant", sa.String(length=10), server_default="normal", nullable=False))
        op.create_check_constraint(
            f"ck_{table}_print_variant",
            table,
            "print_variant IN ('normal', 'foil', 'fa', 'gfa')",
        )


def downgrade() -> None:
    for table in ("vault_trade_cards", "vault_collection_cards"):
        op.drop_constraint(f"ck_{table}_print_variant", table, type_="check")
        op.drop_column(table, "print_variant")
