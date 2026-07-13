"""Validate the Sprint 11 schema baseline contract.

Revision ID: 0010_sprint11_baseline_contract
Revises: 0009_saved_searches
Create Date: 2026-07-13
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect


revision: str = "0010_sprint11_baseline_contract"
down_revision: str | None = "0009_saved_searches"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REQUIRED_TABLE_COLUMNS = {
    "users": {"id", "email", "username", "role"},
    "auctions": {"id", "seller_id", "status", "current_price", "highest_bid_id"},
    "bids": {"id", "auction_id", "bidder_id", "amount"},
    "auction_images": {"id", "auction_id", "storage_key", "list_storage_key"},
    "notifications": {"id", "user_id", "type", "is_read"},
    "reports": {"id", "reporter_id", "target_type", "status"},
    "saved_searches": {"id", "user_id", "name"},
}


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    existing_tables = set(inspector.get_table_names())
    missing_tables = set(REQUIRED_TABLE_COLUMNS) - existing_tables
    if missing_tables:
        raise RuntimeError(f"Sprint 11 baseline is missing tables: {sorted(missing_tables)}")
    for table_name, required_columns in REQUIRED_TABLE_COLUMNS.items():
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        missing_columns = required_columns - existing_columns
        if missing_columns:
            raise RuntimeError(
                f"Sprint 11 baseline table {table_name} is missing columns: {sorted(missing_columns)}"
            )


def downgrade() -> None:
    pass
