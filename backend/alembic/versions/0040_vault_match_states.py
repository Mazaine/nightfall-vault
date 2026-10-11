"""Persist virtual vault match state and notifications.

Revision ID: 0040_vault_match_states
Revises: 0039_vault_decks
"""

from alembic import op
import sqlalchemy as sa


revision = "0040_vault_match_states"
down_revision = "0039_vault_decks"
branch_labels = None
depends_on = None


OLD_NOTIFICATION_TYPES = (
    "outbid", "auction_bid_received", "auction_won", "auction_lost", "auction_sold", "auction_unsold",
    "seller_auction_reminder", "seller_new_auction", "saved_search_match", "report_resolved", "report_dismissed",
    "auction_moderation_action", "auction_message", "transaction_opened", "transaction_confirmation",
    "transaction_completed", "moderation_action", "moderation_strike", "moderation_revoked", "review_received",
    "watchlist_reminder", "bid_withdrawn_bidder", "bid_withdrawn_seller", "bid_leader_changed_after_withdrawal",
    "bid_withdrawal_warning",
)
NEW_NOTIFICATION_TYPES = OLD_NOTIFICATION_TYPES + ("vault_match",)


def _notification_check(values: tuple[str, ...]) -> str:
    return "type IN (" + ", ".join(repr(value) for value in values) + ")"


def upgrade() -> None:
    op.create_table(
        "vault_match_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("collection_card_id", sa.Integer(), nullable=True),
        sa.Column("offered_card_id", sa.Integer(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("match_key", sa.String(length=64), nullable=False),
        sa.Column("external_card_id", sa.String(length=120), nullable=False),
        sa.Column("wanted_quantity", sa.Integer(), nullable=False),
        sa.Column("offered_quantity", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["collection_card_id"], ["vault_collection_cards.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["offered_card_id"], ["vault_trade_cards.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "match_key", name="uq_vault_match_states_user_key"),
    )
    op.create_index("ix_vault_match_states_user_id", "vault_match_states", ["user_id"])
    op.create_index("ix_vault_match_states_collection_card_id", "vault_match_states", ["collection_card_id"])
    op.create_index("ix_vault_match_states_offered_card_id", "vault_match_states", ["offered_card_id"])
    op.create_index("ix_vault_match_states_owner_id", "vault_match_states", ["owner_id"])
    op.create_index("ix_vault_match_states_user_active_seen", "vault_match_states", ["user_id", "is_active", "seen_at"])
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", _notification_check(NEW_NOTIFICATION_TYPES))


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint("ck_notifications_type", "notifications", _notification_check(OLD_NOTIFICATION_TYPES))
    op.drop_table("vault_match_states")
