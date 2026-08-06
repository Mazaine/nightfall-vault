"""Make auction creation idempotent per seller.

Revision ID: 0019_idempotent_auction_creation
Revises: 0018_guarded_bid_withdrawal
Create Date: 2026-08-06
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0019_idempotent_auction_creation"
down_revision: str | None = "0018_guarded_bid_withdrawal"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("creation_key", sa.String(length=36), nullable=True))
    op.create_unique_constraint("uq_auctions_seller_creation_key", "auctions", ["seller_id", "creation_key"])


def downgrade() -> None:
    op.drop_constraint("uq_auctions_seller_creation_key", "auctions", type_="unique")
    op.drop_column("auctions", "creation_key")
