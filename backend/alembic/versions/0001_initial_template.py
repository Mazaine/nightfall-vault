"""initial webshop template schema

Revision ID: 0001_initial_template
Revises:
Create Date: 2026-06-29
"""

from alembic import op

from app.db.base import Base
import app.models  # noqa: F401

revision = "0001_initial_template"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
