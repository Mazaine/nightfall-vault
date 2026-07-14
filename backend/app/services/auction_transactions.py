from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.auction import Auction
from app.models.auction_transaction import AuctionTransaction
from app.models.user import User
from app.services.security_audit import create_domain_audit_log


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ensure_auction_transaction(db: Session, auction: Auction) -> AuctionTransaction | None:
    if auction.status != "sold" or auction.winner_id is None or auction.seller_id == auction.winner_id:
        return None
    existing = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == auction.id))
    if existing is not None:
        return existing
    transaction = AuctionTransaction(
        auction_id=auction.id,
        seller_id=auction.seller_id,
        buyer_id=auction.winner_id,
        amount=auction.current_price,
        status="awaiting_arrangement",
    )
    db.add(transaction)
    db.flush()
    create_domain_audit_log(
        db,
        action="auction_transaction_created",
        auction_id=auction.id,
        metadata={"transaction_id": transaction.id, "amount": str(transaction.amount)},
    )
    return transaction


def transaction_statement():
    return select(AuctionTransaction).options(
        selectinload(AuctionTransaction.auction).selectinload(Auction.images),
        selectinload(AuctionTransaction.seller),
        selectinload(AuctionTransaction.buyer),
    )


def list_user_transactions(db: Session, user: User) -> list[AuctionTransaction]:
    statement = (
        transaction_statement()
        .where(or_(AuctionTransaction.seller_id == user.id, AuctionTransaction.buyer_id == user.id))
        .order_by(AuctionTransaction.updated_at.desc(), AuctionTransaction.id.desc())
    )
    return list(db.scalars(statement).all())


def get_participant_transaction(db: Session, transaction_id: int, user: User, *, lock: bool = False) -> AuctionTransaction:
    statement = transaction_statement().where(
        AuctionTransaction.id == transaction_id,
        or_(AuctionTransaction.seller_id == user.id, AuctionTransaction.buyer_id == user.id),
    )
    if lock:
        statement = statement.with_for_update()
    transaction = db.scalar(statement)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Tranzakció nem található.")
    return transaction


def confirm_handover(db: Session, transaction_id: int, user: User) -> AuctionTransaction:
    transaction = get_participant_transaction(db, transaction_id, user, lock=True)
    confirmation_field = "seller_confirmed_at" if transaction.seller_id == user.id else "buyer_confirmed_at"
    if transaction.status == "completed" and getattr(transaction, confirmation_field) is not None:
        return transaction
    if transaction.status in {"disputed", "cancelled", "completed"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ebben az állapotban a teljesítés nem igazolható vissza.")
    if getattr(transaction, confirmation_field) is None:
        setattr(transaction, confirmation_field, now_utc())
    if transaction.seller_confirmed_at is not None and transaction.buyer_confirmed_at is not None:
        transaction.status = "completed"
        transaction.completed_at = now_utc()
    else:
        transaction.status = "in_progress"
    db.add(transaction)
    create_domain_audit_log(
        db,
        action="auction_transaction_confirmed",
        user_id=user.id,
        auction_id=transaction.auction_id,
        metadata={"transaction_id": transaction.id, "status": transaction.status},
    )
    db.commit()
    return get_participant_transaction(db, transaction.id, user)


def open_dispute(db: Session, transaction_id: int, user: User, reason: str) -> AuctionTransaction:
    transaction = get_participant_transaction(db, transaction_id, user, lock=True)
    if transaction.status in {"completed", "cancelled", "disputed"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ebben az állapotban nem nyitható új vita.")
    transaction.status = "disputed"
    transaction.dispute_opened_by_id = user.id
    transaction.dispute_reason = reason
    db.add(transaction)
    create_domain_audit_log(
        db,
        action="auction_transaction_disputed",
        user_id=user.id,
        auction_id=transaction.auction_id,
        metadata={"transaction_id": transaction.id},
    )
    db.commit()
    return get_participant_transaction(db, transaction.id, user)
