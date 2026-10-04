"""Raise the initial collection capacity from 500 to 1000.

Revision ID: 0036_initial_vault_capacity_1000
Revises: 0035_wanted_zero_quantity
"""

from alembic import op
import sqlalchemy as sa


revision = "0036_initial_vault_capacity_1000"
down_revision = "0035_wanted_zero_quantity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "vault_accounts",
        "base_collection_capacity",
        existing_type=sa.Integer(),
        server_default="1000",
        existing_nullable=False,
    )
    op.execute("UPDATE vault_accounts SET base_collection_capacity = 1000 WHERE base_collection_capacity = 500")


def downgrade() -> None:
    op.execute("UPDATE vault_accounts SET base_collection_capacity = 500 WHERE base_collection_capacity = 1000")
    op.alter_column(
        "vault_accounts",
        "base_collection_capacity",
        existing_type=sa.Integer(),
        server_default="500",
        existing_nullable=False,
    )
