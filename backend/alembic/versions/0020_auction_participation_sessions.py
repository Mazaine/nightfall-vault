"""auction participation exclusions and rotating refresh sessions

Revision ID: 0020_participation_sessions
Revises: 0019_idempotent_auction_creation
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_participation_sessions"
down_revision = "0019_idempotent_auction_creation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auction_bid_exclusions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_bid_id", sa.Integer(), sa.ForeignKey("bids.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.String(40), nullable=False, server_default="user_exit"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("auction_id", "user_id", name="uq_auction_bid_exclusions_auction_user"),
    )
    op.create_index("ix_auction_bid_exclusions_auction_id", "auction_bid_exclusions", ["auction_id"])
    op.create_index("ix_auction_bid_exclusions_user_id", "auction_bid_exclusions", ["user_id"])
    op.create_table(
        "refresh_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("family_id", sa.String(36), nullable=False),
        sa.Column("auth_version", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_digest", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
    )
    op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])
    op.create_index("ix_refresh_sessions_family_id", "refresh_sessions", ["family_id"])
    op.create_index("ix_refresh_sessions_expires_at", "refresh_sessions", ["expires_at"])
    op.create_index("ix_refresh_sessions_family_active", "refresh_sessions", ["family_id", "revoked_at"])


def downgrade() -> None:
    op.drop_table("refresh_sessions")
    op.drop_table("auction_bid_exclusions")
