from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


TRANSACTION_STATUSES = ("awaiting_arrangement", "in_progress", "completed", "disputed", "cancelled")


class AuctionTransaction(Base):
    __tablename__ = "auction_transactions"
    __table_args__ = (
        UniqueConstraint("auction_id", name="uq_auction_transactions_auction"),
        CheckConstraint(f"status IN {TRANSACTION_STATUSES}", name="ck_auction_transactions_status"),
        CheckConstraint("seller_id <> buyer_id", name="ck_auction_transactions_distinct_participants"),
        CheckConstraint("amount > 0", name="ck_auction_transactions_amount_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="awaiting_arrangement", index=True)
    seller_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    buyer_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispute_opened_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    dispute_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    auction = relationship("Auction")
    seller = relationship("User", foreign_keys=[seller_id])
    buyer = relationship("User", foreign_keys=[buyer_id])
    dispute_opened_by = relationship("User", foreign_keys=[dispute_opened_by_id])
