from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Report(Base):
    __tablename__ = "reports"
    TARGET_TYPES = ("auction", "user")
    STATUSES = ("open", "under_review", "resolved", "dismissed")
    PRIORITIES = ("low", "normal", "high", "urgent")
    __table_args__ = (
        CheckConstraint(f"target_type IN {TARGET_TYPES}", name="ck_reports_target_type"),
        CheckConstraint(f"status IN {STATUSES}", name="ck_reports_status"),
        CheckConstraint(f"priority IN {PRIORITIES}", name="ck_reports_priority"),
        CheckConstraint(
            "(target_type = 'auction' AND auction_id IS NOT NULL) OR "
            "(target_type = 'user' AND auction_id IS NULL AND reported_user_id IS NOT NULL)",
            name="ck_reports_target_integrity",
        ),
        Index("ix_reports_status_priority", "status", "priority"),
        Index("ix_reports_target", "target_type", "auction_id", "reported_user_id"),
        Index("ix_reports_reporter_target_status", "reporter_id", "target_type", "auction_id", "reported_user_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    auction_id: Mapped[int | None] = mapped_column(ForeignKey("auctions.id", ondelete="SET NULL"), nullable=True, index=True)
    reported_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open", index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal", index=True)
    assigned_admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reporter = relationship("User", foreign_keys=[reporter_id])
    reported_user = relationship("User", foreign_keys=[reported_user_id])
    assigned_admin = relationship("User", foreign_keys=[assigned_admin_id])
    auction = relationship("Auction")


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_user_blocks_blocker_blocked"),
        CheckConstraint("blocker_id <> blocked_id", name="ck_user_blocks_no_self_block"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    blocker_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    blocker = relationship("User", foreign_keys=[blocker_id])
    blocked = relationship("User", foreign_keys=[blocked_id])


MODERATION_ACTION_TYPES = (
    "warning",
    "auction_creation_ban",
    "bidding_ban",
    "chat_ban",
    "temporary_ban",
    "permanent_ban",
)
STRIKE_SEVERITIES = ("low", "medium", "high", "critical")


class ModerationAction(Base):
    __tablename__ = "moderation_actions"
    __table_args__ = (
        CheckConstraint(f"action_type IN {MODERATION_ACTION_TYPES}", name="ck_moderation_actions_type"),
        CheckConstraint("expires_at IS NULL OR expires_at > starts_at", name="ck_moderation_actions_expiry"),
        Index("ix_moderation_actions_target_active", "target_user_id", "action_type", "expires_at", "revoked_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    internal_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    source_report_id: Mapped[int | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"), nullable=True, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    target_user = relationship("User", foreign_keys=[target_user_id])
    created_by_admin = relationship("User", foreign_keys=[created_by_admin_id])
    revoked_by_admin = relationship("User", foreign_keys=[revoked_by_admin_id])
    source_report = relationship("Report")


class UserStrike(Base):
    __tablename__ = "user_strikes"
    __table_args__ = (
        CheckConstraint(f"severity IN {STRIKE_SEVERITIES}", name="ck_user_strikes_severity"),
        Index("ix_user_strikes_user_active", "user_id", "expires_at", "revoked_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    source_report_id: Mapped[int | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"), nullable=True, index=True)
    issued_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    issued_by_admin = relationship("User", foreign_keys=[issued_by_admin_id])
    revoked_by_admin = relationship("User", foreign_keys=[revoked_by_admin_id])
    source_report = relationship("Report")
