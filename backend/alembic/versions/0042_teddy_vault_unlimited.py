"""Grant the explicit unlimited Vault entitlement to user #10.

Revision ID: 0042_teddy_vault_unlimited
Revises: 0041_vault_quantity_limits
"""

from alembic import op
import sqlalchemy as sa


revision = "0042_teddy_vault_unlimited"
down_revision = "0041_vault_quantity_limits"
branch_labels = None
depends_on = None


TEDDY_USER_ID = 10


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO vault_accounts (
                user_id, base_collection_capacity, trade_capacity, vault_unlimited
            )
            SELECT id, 1000, 200, TRUE
            FROM users
            WHERE id = :user_id
            ON CONFLICT (user_id) DO UPDATE
            SET vault_unlimited = TRUE
            """
        ).bindparams(user_id=TEDDY_USER_ID)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE vault_accounts
            SET vault_unlimited = FALSE
            WHERE user_id = :user_id
            """
        ).bindparams(user_id=TEDDY_USER_ID)
    )
