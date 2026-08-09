"""add card condition scale and printing error fields

Revision ID: 0024_card_condition_scale
Revises: 0023_vip_reminders_links
"""

from alembic import op
import sqlalchemy as sa


revision = "0024_card_condition_scale"
down_revision = "0023_vip_reminders_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_auctions_condition", "auctions", type_="check")
    op.create_check_constraint(
        "ck_auctions_condition",
        "auctions",
        "condition IN ('M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO', 'fresh', 'like_new', 'played', 'damaged', 'worn', 'misprint')",
    )
    op.add_column("auctions", sa.Column("has_printing_error", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("auctions", sa.Column("printing_error_description", sa.String(length=500), nullable=True))
    op.create_check_constraint(
        "ck_auctions_printing_error_description",
        "auctions",
        "printing_error_description IS NULL OR (length(trim(printing_error_description)) BETWEEN 3 AND 500)",
    )
    op.create_check_constraint(
        "ck_auctions_printing_error_consistency",
        "auctions",
        "has_printing_error = true OR printing_error_description IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_auctions_printing_error_consistency", "auctions", type_="check")
    op.drop_constraint("ck_auctions_printing_error_description", "auctions", type_="check")
    op.drop_column("auctions", "printing_error_description")
    op.drop_column("auctions", "has_printing_error")
    op.drop_constraint("ck_auctions_condition", "auctions", type_="check")
    op.create_check_constraint(
        "ck_auctions_condition",
        "auctions",
        "condition IN ('fresh', 'like_new', 'played', 'damaged', 'worn', 'misprint')",
    )
