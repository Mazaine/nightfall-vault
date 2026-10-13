"""Allow up to nine copies in virtual vault workflows.

Revision ID: 0041_vault_quantity_limits
Revises: 0040_vault_match_states
"""

from alembic import op


revision = "0041_vault_quantity_limits"
down_revision = "0040_vault_match_states"
branch_labels = None
depends_on = None


def _replace(name: str, table: str, expression: str) -> None:
    op.drop_constraint(name, table, type_="check")
    op.create_check_constraint(name, table, expression)


def upgrade() -> None:
    _replace("ck_vault_collection_cards_quantity", "vault_collection_cards", "quantity BETWEEN 0 AND 9")
    _replace("ck_vault_collection_cards_wanted_quantity", "vault_collection_cards", "wanted_quantity BETWEEN 0 AND 9")
    _replace("ck_vault_trade_cards_quantity", "vault_trade_cards", "quantity BETWEEN 1 AND 9")
    _replace("ck_vault_card_loans_quantity", "vault_card_loans", "quantity BETWEEN 1 AND 9")


def downgrade() -> None:
    _replace("ck_vault_collection_cards_quantity", "vault_collection_cards", "quantity BETWEEN 0 AND 3")
    _replace("ck_vault_collection_cards_wanted_quantity", "vault_collection_cards", "wanted_quantity BETWEEN 0 AND 3")
    _replace("ck_vault_trade_cards_quantity", "vault_trade_cards", "quantity BETWEEN 1 AND 3")
    _replace("ck_vault_card_loans_quantity", "vault_card_loans", "quantity BETWEEN 1 AND 3")
