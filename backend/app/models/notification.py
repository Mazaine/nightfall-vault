from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Notification(Base):
    __tablename__ = "notifications"
    NOTIFICATION_TYPES = ("outbid", "auction_won", "auction_lost", "auction_sold", "auction_unsold", "seller_new_auction", "saved_search_match", "report_resolved", "report_dismissed", "auction_moderation_action", "auction_message", "transaction_opened", "transaction_confirmation", "transaction_completed", "moderation_action", "moderation_strike", "moderation_revoked", "review_received", "watchlist_reminder")
    __table_args__ = (
        CheckConstraint(f"type IN {NOTIFICATION_TYPES}", name="ck_notifications_type"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index("ix_notifications_user_read", "user_id", "read_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    auction_id: Mapped[int | None] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False, default="system")
    target_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    event_key: Mapped[str | None] = mapped_column(String(180), nullable=True, unique=True)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    browser_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User")
    auction = relationship("Auction")


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    CATEGORIES = ("bids", "chat", "follows", "transactions", "reviews", "moderation", "system")
    __table_args__ = (
        CheckConstraint(f"category IN {CATEGORIES}", name="ck_notification_preferences_category"),
        UniqueConstraint("user_id", "category", name="uq_notification_preferences_user_category"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    browser: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user = relationship("User")


class WatchlistReminder(Base):
    __tablename__ = "watchlist_reminders"
    __table_args__ = (
        CheckConstraint("minutes_before IN (1, 5, 10, 30)", name="ck_watchlist_reminders_minutes"),
        UniqueConstraint("user_id", "auction_id", "minutes_before", name="uq_watchlist_reminders_once"),
        Index("ix_watchlist_reminders_due", "sent_at", "minutes_before"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    minutes_before: Mapped[int] = mapped_column(Integer, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
