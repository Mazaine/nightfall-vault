from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('user', 'tester', 'admin')", name="ck_users_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_login_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    auth_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    demo_batch_id: Mapped[int | None] = mapped_column(ForeignKey("demo_auction_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    vip_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    vip_reminder_one_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    vip_reminder_one_hour: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    vip_reminder_five_minutes: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    bid_withdrawal_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    bid_withdrawal_warning_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    bid_withdrawal_first_warning_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_bid_withdrawal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    bid_withdrawal_disabled_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    bid_withdrawal_permanently_disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    notify_in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_email_outbid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_email_auction_result: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_email_moderation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    auth_identities = relationship("UserAuthIdentity", back_populates="user", cascade="all, delete-orphan")


class UserAuthIdentity(Base):
    __tablename__ = "user_auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_user_auth_identities_provider_subject"),
        UniqueConstraint("user_id", "provider", name="uq_user_auth_identities_user_provider"),
        CheckConstraint("provider IN ('google', 'apple', 'facebook')", name="ck_user_auth_identities_provider"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="auth_identities")

class SellerFollow(Base):
    __tablename__ = "seller_follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "seller_id", name="uq_seller_follows_follower_seller"),
        CheckConstraint("follower_id <> seller_id", name="ck_seller_follows_no_self_follow"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    follower = relationship("User", foreign_keys=[follower_id])
    seller = relationship("User", foreign_keys=[seller_id])


class SavedSearch(Base):
    __tablename__ = "saved_searches"
    __table_args__ = (
        Index("ix_saved_searches_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    query: Mapped[str | None] = mapped_column(String(180), nullable=True)
    title: Mapped[str | None] = mapped_column(String(180), nullable=True)
    description: Mapped[str | None] = mapped_column(String(180), nullable=True)
    seller: Mapped[str | None] = mapped_column(String(80), nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    hatalom_era: Mapped[str | None] = mapped_column(String(20), nullable=True)
    condition: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    min_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    max_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    min_bids: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_bids: Mapped[int | None] = mapped_column(Integer, nullable=True)
    buy_now: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    soon_ending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    new_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User")


class VipActivationCode(Base):
    __tablename__ = "vip_activation_codes"
    __table_args__ = (
        CheckConstraint("duration_months IN (1, 3)", name="ck_vip_activation_codes_duration"),
        Index("ix_vip_activation_codes_batch_created", "batch_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code_digest: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    code_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_last_four: Mapped[str] = mapped_column(String(4), nullable=False)
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False)
    batch_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    created_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    redeemed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    created_by_admin = relationship("User", foreign_keys=[created_by_admin_id])
    redeemed_by_user = relationship("User", foreign_keys=[redeemed_by_user_id])
