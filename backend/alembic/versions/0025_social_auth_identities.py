"""add social authentication identities

Revision ID: 0025_social_auth_identities
Revises: 0024_card_condition_scale
"""

from alembic import op
import sqlalchemy as sa

revision = "0025_social_auth_identities"
down_revision = "0024_card_condition_scale"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_login_enabled", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.create_table(
        "user_auth_identities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_subject", sa.String(length=255), nullable=False),
        sa.Column("provider_email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("provider IN ('google', 'apple', 'facebook')", name="ck_user_auth_identities_provider"),
        sa.UniqueConstraint("provider", "provider_subject", name="uq_user_auth_identities_provider_subject"),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_auth_identities_user_provider"),
    )
    op.create_index("ix_user_auth_identities_user_id", "user_auth_identities", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_auth_identities")
    op.drop_column("users", "password_login_enabled")
