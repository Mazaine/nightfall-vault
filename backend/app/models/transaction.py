from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


TRANSACTION_STATUSES = ("transaction_open", "completed", "reviewed", "archived")


class AuctionTransaction(Base):
    __tablename__ = "auction_transactions"
    __table_args__ = (
        UniqueConstraint("auction_id", name="uq_auction_transactions_auction"),
        CheckConstraint(f"status IN {TRANSACTION_STATUSES}", name="ck_auction_transactions_status"),
        CheckConstraint("seller_id <> buyer_id", name="ck_auction_transactions_distinct_participants"),
        Index("ix_auction_transactions_participants", "seller_id", "buyer_id"),
        Index("ix_auction_transactions_status_updated", "status", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="transaction_open", index=True)
    seller_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    buyer_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    auction = relationship("Auction")
    seller = relationship("User", foreign_keys=[seller_id])
    buyer = relationship("User", foreign_keys=[buyer_id])
