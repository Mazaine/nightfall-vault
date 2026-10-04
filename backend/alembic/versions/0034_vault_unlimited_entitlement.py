"""Add the explicit unlimited vault entitlement.

Revision ID: 0034_vault_unlimited_entitlement
Revises: 0033_virtual_hkk_vault
"""

from alembic import op
import sqlalchemy as sa


revision = "0034_vault_unlimited_entitlement"
down_revision = "0033_virtual_hkk_vault"
branch_labels = None
depends_on = None


OWNER_EMAIL = "mazaine89@gmail.com"


def upgrade() -> None:
    op.add_column(
        "vault_accounts",
        sa.Column("vault_unlimited", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO vault_accounts (
                user_id, base_collection_capacity, trade_capacity, vault_unlimited
            )
            SELECT id, 500, 200, TRUE
            FROM users
            WHERE lower(email) = :owner_email
            ON CONFLICT (user_id) DO UPDATE
            SET vault_unlimited = TRUE
            """
        ).bindparams(owner_email=OWNER_EMAIL)
    )


def downgrade() -> None:
    op.drop_column("vault_accounts", "vault_unlimited")
