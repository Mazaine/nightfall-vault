"""Add operations, media and notification preferences.

Revision ID: 0006_operations_media_email
Revises: 0005_production_readiness
Create Date: 2026-07-12 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_operations_media_email"
down_revision: str | None = "0005_production_readiness"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("auction_images", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("auction_images", sa.Column("height", sa.Integer(), nullable=True))
    op.add_column("auction_images", sa.Column("thumbnail_storage_key", sa.String(length=500), nullable=True))
    op.add_column("auction_images", sa.Column("list_storage_key", sa.String(length=500), nullable=True))
    op.add_column("auction_images", sa.Column("detail_storage_key", sa.String(length=500), nullable=True))
    op.add_column("users", sa.Column("notify_in_app", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("users", sa.Column("notify_email_outbid", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("users", sa.Column("notify_email_auction_result", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("users", sa.Column("notify_email_moderation", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("users", "notify_email_moderation")
    op.drop_column("users", "notify_email_auction_result")
    op.drop_column("users", "notify_email_outbid")
    op.drop_column("users", "notify_in_app")
    op.drop_column("auction_images", "detail_storage_key")
    op.drop_column("auction_images", "list_storage_key")
    op.drop_column("auction_images", "thumbnail_storage_key")
    op.drop_column("auction_images", "height")
    op.drop_column("auction_images", "width")
