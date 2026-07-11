"""Add bid domain and auction current price.

Revision ID: 0003_bid_domain
Revises: 0002_auction_domain
Create Date: 2026-07-11 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0003_bid_domain"
down_revision: str | None = "0002_auction_domain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bids",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("auction_id", sa.Integer(), nullable=False),
        sa.Column("bidder_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_bids_amount_positive"),
        sa.ForeignKeyConstraint(["auction_id"], ["auctions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bidder_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bids_auction_id", "bids", ["auction_id"])
    op.create_index("ix_bids_bidder_id", "bids", ["bidder_id"])
    op.create_index("ix_bids_auction_amount", "bids", ["auction_id", "amount"])
    op.create_index("ix_bids_auction_created", "bids", ["auction_id", "created_at"])

    op.add_column("auctions", sa.Column("current_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("auctions", sa.Column("highest_bid_id", sa.Integer(), nullable=True))
    op.execute("UPDATE auctions SET current_price = starting_price WHERE current_price IS NULL")
    op.alter_column("auctions", "current_price", nullable=False)
    op.create_foreign_key("fk_auctions_highest_bid_id_bids", "auctions", "bids", ["highest_bid_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_auctions_highest_bid_id", "auctions", ["highest_bid_id"])


def downgrade() -> None:
    op.drop_index("ix_auctions_highest_bid_id", table_name="auctions")
    op.drop_constraint("fk_auctions_highest_bid_id_bids", "auctions", type_="foreignkey")
    op.drop_column("auctions", "highest_bid_id")
    op.drop_column("auctions", "current_price")

    op.drop_index("ix_bids_auction_created", table_name="bids")
    op.drop_index("ix_bids_auction_amount", table_name="bids")
    op.drop_index("ix_bids_bidder_id", table_name="bids")
    op.drop_index("ix_bids_auction_id", table_name="bids")
    op.drop_table("bids")
