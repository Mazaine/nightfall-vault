"""Add production readiness auction support.

Revision ID: 0005_production_readiness
Revises: 0004_notifications_and_realtime
Create Date: 2026-07-12 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0005_production_readiness"
down_revision: str | None = "0004_notifications_and_realtime"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold')",
    )

    op.add_column("auctions", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("auctions", sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("auctions", sa.Column("moderated_by_admin_id", sa.Integer(), nullable=True))
    op.add_column("auctions", sa.Column("moderation_reason", sa.Text(), nullable=True))
    op.add_column("auctions", sa.Column("moderation_previous_status", sa.String(length=30), nullable=True))
    op.create_foreign_key("fk_auctions_moderated_by_admin_id_users", "auctions", "users", ["moderated_by_admin_id"], ["id"])
    op.create_index("ix_auctions_deleted_at", "auctions", ["deleted_at"])
    op.create_index("ix_auctions_moderated_by_admin_id", "auctions", ["moderated_by_admin_id"])

    op.add_column("audit_logs", sa.Column("auction_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_audit_logs_auction_id_auctions", "audit_logs", "auctions", ["auction_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_audit_logs_auction_id", "audit_logs", ["auction_id"])

    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("auction_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["auction_id"], ["auctions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "auction_id", name="uq_watchlist_user_auction"),
    )
    op.create_index("ix_watchlist_items_auction_id", "watchlist_items", ["auction_id"])
    op.create_index("ix_watchlist_items_user_id", "watchlist_items", ["user_id"])
    op.create_index("ix_watchlist_user_created", "watchlist_items", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_watchlist_user_created", table_name="watchlist_items")
    op.drop_index("ix_watchlist_items_user_id", table_name="watchlist_items")
    op.drop_index("ix_watchlist_items_auction_id", table_name="watchlist_items")
    op.drop_table("watchlist_items")

    op.drop_index("ix_audit_logs_auction_id", table_name="audit_logs")
    op.drop_constraint("fk_audit_logs_auction_id_auctions", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "auction_id")

    op.drop_index("ix_auctions_moderated_by_admin_id", table_name="auctions")
    op.drop_index("ix_auctions_deleted_at", table_name="auctions")
    op.drop_constraint("fk_auctions_moderated_by_admin_id_users", "auctions", type_="foreignkey")
    op.drop_column("auctions", "moderation_previous_status")
    op.drop_column("auctions", "moderation_reason")
    op.drop_column("auctions", "moderated_by_admin_id")
    op.drop_column("auctions", "moderated_at")
    op.drop_column("auctions", "deleted_at")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
