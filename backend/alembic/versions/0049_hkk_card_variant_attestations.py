"""Add official per-print HKK variant attestations.

Revision ID: 0049_hkk_variant_attest
Revises: 0048_marketplace_cart
"""
from alembic import op
import sqlalchemy as sa

revision = "0049_hkk_variant_attest"
down_revision = "0048_marketplace_cart"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hkk_card_variant_attestations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("external_card_id", sa.String(120), nullable=False),
        sa.Column("card_name", sa.String(180), nullable=False),
        sa.Column("edition_id", sa.String(20), nullable=False),
        sa.Column("edition_name", sa.String(120), nullable=False),
        sa.Column("variant", sa.String(10), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="unknown"),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verification_method", sa.String(20), nullable=False, server_default="official_api"),
        sa.Column("manually_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("external_card_id", "variant", name="uq_hkk_card_variant_attestations_card_variant"),
        sa.CheckConstraint("variant IN ('normal', 'foil', 'fa', 'gfa')", name="ck_hkk_card_variant_attestations_variant"),
        sa.CheckConstraint("status IN ('exists', 'absent', 'unknown')", name="ck_hkk_card_variant_attestations_status"),
        sa.CheckConstraint("verification_method IN ('official_api', 'manual_csv')", name="ck_hkk_card_variant_attestations_method"),
    )
    op.create_index("ix_hkk_card_variant_attestations_edition", "hkk_card_variant_attestations", ["edition_id", "external_card_id"])
    op.create_index("ix_hkk_card_variant_attestations_status", "hkk_card_variant_attestations", ["status", "variant"])


def downgrade() -> None:
    op.drop_index("ix_hkk_card_variant_attestations_status", table_name="hkk_card_variant_attestations")
    op.drop_index("ix_hkk_card_variant_attestations_edition", table_name="hkk_card_variant_attestations")
    op.drop_table("hkk_card_variant_attestations")
