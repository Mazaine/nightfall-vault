"""Add saved searches and saved-search notifications.

Revision ID: 0009_saved_searches
Revises: 0008_reports_and_user_blocks
Create Date: 2026-07-13
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0009_saved_searches"
down_revision: str | None = "0008_reports_and_user_blocks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_searches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("query", sa.String(length=180), nullable=True),
        sa.Column("title", sa.String(length=180), nullable=True),
        sa.Column("description", sa.String(length=180), nullable=True),
        sa.Column("seller", sa.String(length=80), nullable=True),
        sa.Column("category", sa.String(length=80), nullable=True),
        sa.Column("condition", sa.String(length=30), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=True),
        sa.Column("min_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("max_price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("min_bids", sa.Integer(), nullable=True),
        sa.Column("max_bids", sa.Integer(), nullable=True),
        sa.Column("buy_now", sa.Boolean(), nullable=True),
        sa.Column("soon_ending", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("new_only", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saved_searches_user_id", "saved_searches", ["user_id"])
    op.create_index("ix_saved_searches_user_created", "saved_searches", ["user_id", "created_at"])
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction', 'saved_search_match', 'report_resolved', 'report_dismissed', 'auction_moderation_action')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction', 'report_resolved', 'report_dismissed', 'auction_moderation_action')",
    )
    op.drop_index("ix_saved_searches_user_created", table_name="saved_searches")
    op.drop_index("ix_saved_searches_user_id", table_name="saved_searches")
    op.drop_table("saved_searches")
