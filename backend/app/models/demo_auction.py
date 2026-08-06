from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


DEMO_BATCH_STATUSES = ("creating", "active", "deleting", "deleted", "failed")


class DemoAuctionBatch(Base):
    __tablename__ = "demo_auction_batches"
    __table_args__ = (
        CheckConstraint(f"status IN {DEMO_BATCH_STATUSES}", name="ck_demo_auction_batches_status"),
        CheckConstraint("regular_count >= 0 AND featured_count >= 0", name="ck_demo_auction_batches_counts"),
        Index("ix_demo_auction_batches_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_key: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="creating", index=True)
    regular_count: Mapped[int] = mapped_column(Integer, nullable=False)
    featured_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_admin = relationship("User", foreign_keys=[created_by_admin_id])
