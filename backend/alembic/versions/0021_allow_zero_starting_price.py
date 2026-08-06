"""allow zero auction starting price

Revision ID: 0021_zero_starting_price
Revises: 0020_participation_sessions
"""

from alembic import op


revision = "0021_zero_starting_price"
down_revision = "0020_participation_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_auctions_starting_price_positive", "auctions", type_="check")
    op.create_check_constraint("ck_auctions_starting_price_positive", "auctions", "starting_price >= 0")


def downgrade() -> None:
    op.drop_constraint("ck_auctions_starting_price_positive", "auctions", type_="check")
    op.execute("UPDATE auctions SET current_price = 0.01 WHERE starting_price = 0 AND current_price = 0")
    op.execute("UPDATE auctions SET starting_price = 0.01 WHERE starting_price = 0")
    op.create_check_constraint("ck_auctions_starting_price_positive", "auctions", "starting_price > 0")
