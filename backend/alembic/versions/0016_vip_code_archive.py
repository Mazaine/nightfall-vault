"""Store VIP codes encrypted for controlled admin reprints.

Revision ID: 0016_vip_code_archive
Revises: 0015_vip_membership
Create Date: 2026-07-23
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0016_vip_code_archive"
down_revision: str | None = "0015_vip_membership"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("vip_activation_codes", sa.Column("code_ciphertext", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vip_activation_codes", "code_ciphertext")
