"""Type saved marketplace searches by listing kind and HKK variant.

Revision ID: 0052_saved_search_types
Revises: 0051_vault_trade_offers
"""
from alembic import op
import sqlalchemy as sa


revision = "0052_saved_search_types"
down_revision = "0051_vault_trade_offers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("saved_searches", sa.Column("listing_type", sa.String(length=20), nullable=True))
    op.add_column("saved_searches", sa.Column("listing_format", sa.String(length=20), nullable=True))
    op.add_column("saved_searches", sa.Column("variant", sa.String(length=20), nullable=True))
    # A korábbi mentések az aukciós keresőből származtak; típusosítjuk őket,
    # hogy ne jelenjenek meg tévesen a Lapok vagy Csomagok fülön.
    op.execute("UPDATE saved_searches SET listing_type = 'auction' WHERE listing_type IS NULL")


def downgrade() -> None:
    op.drop_column("saved_searches", "variant")
    op.drop_column("saved_searches", "listing_format")
    op.drop_column("saved_searches", "listing_type")
