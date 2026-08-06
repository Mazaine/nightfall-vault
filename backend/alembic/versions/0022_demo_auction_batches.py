"""add demo auction batches and tester role

Revision ID: 0022_demo_auction_batches
Revises: 0021_zero_starting_price
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_demo_auction_batches"
down_revision = "0021_zero_starting_price"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint("ck_users_role", "users", "role IN ('user', 'tester', 'admin')")
    op.create_table(
        "demo_auction_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_key", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("regular_count", sa.Integer(), nullable=False),
        sa.Column("featured_count", sa.Integer(), nullable=False),
        sa.Column("created_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.CheckConstraint("status IN ('creating', 'active', 'deleting', 'deleted', 'failed')", name="ck_demo_auction_batches_status"),
        sa.CheckConstraint("regular_count >= 0 AND featured_count >= 0", name="ck_demo_auction_batches_counts"),
        sa.ForeignKeyConstraint(["created_by_admin_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("batch_key"),
    )
    op.create_index("ix_demo_auction_batches_batch_key", "demo_auction_batches", ["batch_key"], unique=True)
    op.create_index("ix_demo_auction_batches_status", "demo_auction_batches", ["status"])
    op.create_index("ix_demo_auction_batches_created_by_admin_id", "demo_auction_batches", ["created_by_admin_id"])
    op.create_index("ix_demo_auction_batches_status_created", "demo_auction_batches", ["status", "created_at"])
    op.execute("CREATE UNIQUE INDEX uq_demo_auction_batches_single_live ON demo_auction_batches ((1)) WHERE status IN ('creating', 'active', 'deleting')")
    op.add_column("users", sa.Column("demo_batch_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_users_demo_batch_id", "users", "demo_auction_batches", ["demo_batch_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_users_demo_batch_id", "users", ["demo_batch_id"])
    op.add_column("auctions", sa.Column("demo_batch_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_auctions_demo_batch_id", "auctions", "demo_auction_batches", ["demo_batch_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_auctions_demo_batch_id", "auctions", ["demo_batch_id"])


def downgrade() -> None:
    op.drop_index("ix_auctions_demo_batch_id", table_name="auctions")
    op.drop_constraint("fk_auctions_demo_batch_id", "auctions", type_="foreignkey")
    op.drop_column("auctions", "demo_batch_id")
    op.drop_index("ix_users_demo_batch_id", table_name="users")
    op.drop_constraint("fk_users_demo_batch_id", "users", type_="foreignkey")
    op.drop_column("users", "demo_batch_id")
    op.drop_table("demo_auction_batches")
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.execute("UPDATE users SET role = 'user' WHERE role = 'tester'")
    op.create_check_constraint("ck_users_role", "users", "role IN ('user', 'admin')")
