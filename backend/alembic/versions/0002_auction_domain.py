"""add auction domain

Revision ID: 0002_auction_domain
Revises: 0001_initial_template
Create Date: 2026-07-11
"""

from alembic import op

from app.db.base import Base
import app.models  # noqa: F401

revision = "0002_auction_domain"
down_revision = "0001_initial_template"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(
        bind=op.get_bind(),
        tables=[
            Base.metadata.tables["auctions"],
            Base.metadata.tables["auction_images"],
            Base.metadata.tables["auction_messages"],
            Base.metadata.tables["auction_reviews"],
        ],
    )


def downgrade() -> None:
    op.drop_table("auction_reviews")
    op.drop_table("auction_messages")
    op.drop_index("uq_auction_images_one_cover", table_name="auction_images")
    op.drop_table("auction_images")
    op.drop_table("auctions")
