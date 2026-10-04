"""Allow wanted-only collection entries with zero owned copies.

Revision ID: 0035_wanted_zero_quantity
Revises: 0034_vault_unlimited_entitlement
"""

from alembic import op


revision = "0035_wanted_zero_quantity"
down_revision = "0034_vault_unlimited_entitlement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_vault_collection_cards_quantity", "vault_collection_cards", type_="check")
    op.drop_constraint("ck_vault_collection_cards_wanted_quantity", "vault_collection_cards", type_="check")
    op.create_check_constraint("ck_vault_collection_cards_quantity", "vault_collection_cards", "quantity BETWEEN 0 AND 3")
    op.create_check_constraint("ck_vault_collection_cards_wanted_quantity", "vault_collection_cards", "wanted_quantity BETWEEN 0 AND 3")


def downgrade() -> None:
    op.execute("DELETE FROM vault_collection_cards WHERE quantity = 0")
    op.drop_constraint("ck_vault_collection_cards_wanted_quantity", "vault_collection_cards", type_="check")
    op.drop_constraint("ck_vault_collection_cards_quantity", "vault_collection_cards", type_="check")
    op.create_check_constraint("ck_vault_collection_cards_quantity", "vault_collection_cards", "quantity BETWEEN 1 AND 3")
    op.create_check_constraint("ck_vault_collection_cards_wanted_quantity", "vault_collection_cards", "wanted_quantity BETWEEN 0 AND 2")
