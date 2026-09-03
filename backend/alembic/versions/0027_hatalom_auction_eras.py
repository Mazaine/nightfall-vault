"""add optional Hatalom auction eras

Revision ID: 0027_hatalom_auction_eras
Revises: 0026_seller_bid_notifications
"""

from alembic import op
import sqlalchemy as sa

revision = "0027_hatalom_auction_eras"
down_revision = "0026_seller_bid_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("hatalom_era", sa.String(length=20), nullable=True))
    op.create_check_constraint(
        "ck_auctions_hatalom_era",
        "auctions",
        "hatalom_era IS NULL OR (category = 'Hatalom Kártyái Kártyajáték' AND hatalom_era IN ('retro', 'ujkor', 'uj_nemzedek'))",
    )
    op.create_index("ix_auctions_category_hatalom_era", "auctions", ["category", "hatalom_era"])
    op.add_column("saved_searches", sa.Column("hatalom_era", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("saved_searches", "hatalom_era")
    op.drop_index("ix_auctions_category_hatalom_era", table_name="auctions")
    op.drop_constraint("ck_auctions_hatalom_era", "auctions", type_="check")
    op.drop_column("auctions", "hatalom_era")
