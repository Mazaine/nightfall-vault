"""Add public profile follow support.

Revision ID: 0007_profiles_and_follows
Revises: 0006_operations_media_email
Create Date: 2026-07-12
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0007_profiles_and_follows"
down_revision: str | None = "0006_operations_media_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "seller_follows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("follower_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("follower_id <> seller_id", name="ck_seller_follows_no_self_follow"),
        sa.ForeignKeyConstraint(["follower_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["seller_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("follower_id", "seller_id", name="uq_seller_follows_follower_seller"),
    )
    op.create_index("ix_seller_follows_follower_id", "seller_follows", ["follower_id"])
    op.create_index("ix_seller_follows_seller_id", "seller_follows", ["seller_id"])
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold', 'seller_new_auction')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type",
        "notifications",
        "type IN ('outbid', 'auction_won', 'auction_lost', 'auction_sold', 'auction_unsold')",
    )
    op.drop_index("ix_seller_follows_seller_id", table_name="seller_follows")
    op.drop_index("ix_seller_follows_follower_id", table_name="seller_follows")
    op.drop_table("seller_follows")
