"""Stop cart-level inventory reservations without deleting history.

Revision ID: 0050_cart_no_reservations
Revises: 0049_hkk_variant_attest
"""
from alembic import op


revision = "0050_cart_no_reservations"
down_revision = "0049_hkk_variant_attest"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The cart becomes a persistent intent list. Historical rows stay intact, but
    # no legacy active reservation may keep stock blocked after this migration.
    op.execute("""
        UPDATE inventory_reservations
        SET status = 'released', released_at = COALESCE(released_at, CURRENT_TIMESTAMP)
        WHERE status = 'active'
    """)


def downgrade() -> None:
    # Released reservations cannot be reconstructed safely: their former expiry
    # and the intervening sales are authoritative, so downgrade is data-neutral.
    pass
