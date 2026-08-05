"""Add revocable authentication session version.

Revision ID: 0017_auth_session_version
Revises: 0016_vip_code_archive
Create Date: 2026-08-05
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0017_auth_session_version"
down_revision: str | None = "0016_vip_code_archive"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "auth_version")
