from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.auction import Auction, AuctionReview
from app.models.transaction import AuctionTransaction
from app.models.user import User
from app.services.security_audit import create_domain_audit_log


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def transaction_options():
    return (
        joinedload(AuctionTransaction.auction),
        joinedload(AuctionTransaction.seller),
        joinedload(AuctionTransaction.buyer),
    )


def ensure_transaction_for_sold_auction(db: Session, auction: Auction) -> tuple[AuctionTransaction | None, bool]:
    if auction.status != "sold" or auction.winner_id is None or auction.seller_id == auction.winner_id:
        return None, False
    existing = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == auction.id))
    if existing is not None:
        return existing, False
    transaction_id = db.scalar(
        insert(AuctionTransaction)
        .values(auction_id=auction.id, seller_id=auction.seller_id, buyer_id=auction.winner_id, status="transaction_open")
        .on_conflict_do_nothing(index_elements=[AuctionTransaction.auction_id])
        .returning(AuctionTransaction.id)
    )
    if transaction_id is None:
        existing = db.scalar(select(AuctionTransaction).where(AuctionTransaction.auction_id == auction.id))
        return existing, False
    transaction = db.get(AuctionTransaction, transaction_id)
    if transaction is None:
        raise RuntimeError("A létrehozott tranzakció nem tölthető vissza.")
    create_domain_audit_log(
        db,
        action="transaction_created",
        auction_id=auction.id,
        metadata={"transaction_id": transaction.id, "seller_id": auction.seller_id, "buyer_id": auction.winner_id},
    )
    return transaction, True


def get_participant_transaction(db: Session, transaction_id: int, user_id: int, *, lock: bool = False) -> AuctionTransaction:
    statement = select(AuctionTransaction).where(
        AuctionTransaction.id == transaction_id,
        or_(AuctionTransaction.seller_id == user_id, AuctionTransaction.buyer_id == user_id),
    )
    if lock:
        statement = statement.with_for_update()
    else:
        statement = statement.options(*transaction_options())
    transaction = db.scalar(statement)
    if transaction is None:
        raise HTTPException(status_code=404, detail="A tranzakció nem található.")
    return transaction


def serialize_transaction(transaction: AuctionTransaction, user_id: int) -> dict:
    seller_role = transaction.seller_id == user_id
    own_completed_at = transaction.seller_completed_at if seller_role else transaction.buyer_completed_at
    partner_completed_at = transaction.buyer_completed_at if seller_role else transaction.seller_completed_at
    reviews = transaction.auction.reviews if hasattr(transaction.auction, "reviews") else []
    has_reviewed = any(review.reviewer_id == user_id for review in reviews)
    return {
        "id": transaction.id,
        "auction_id": transaction.auction_id,
        "status": transaction.status,
        "seller_completed_at": transaction.seller_completed_at,
        "buyer_completed_at": transaction.buyer_completed_at,
        "completed_at": transaction.completed_at,
        "review_deadline": transaction.review_deadline,
        "archived_at": transaction.archived_at,
        "created_at": transaction.created_at,
        "updated_at": transaction.updated_at,
        "role": "seller" if seller_role else "buyer",
        "own_completed_at": own_completed_at,
        "partner_completed_at": partner_completed_at,
        "can_confirm": transaction.status == "transaction_open" and own_completed_at is None,
        "can_review": transaction.status in {"completed", "reviewed"} and not has_reviewed and (transaction.review_deadline is None or transaction.review_deadline > now_utc()),
        "auction": transaction.auction,
        "partner": transaction.buyer if seller_role else transaction.seller,
    }


def confirm_completion(db: Session, transaction_id: int, user: User) -> AuctionTransaction:
    transaction = get_participant_transaction(db, transaction_id, user.id, lock=True)
    if transaction.status != "transaction_open":
        if transaction.status == "completed" and (
            (transaction.seller_id == user.id and transaction.seller_completed_at)
            or (transaction.buyer_id == user.id and transaction.buyer_completed_at)
        ):
            return transaction
        raise HTTPException(status_code=409, detail="Ez a tranzakció már nem erősíthető meg.")
    timestamp = now_utc()
    if transaction.seller_id == user.id:
        if transaction.seller_completed_at is not None:
            return transaction
        transaction.seller_completed_at = timestamp
    else:
        if transaction.buyer_completed_at is not None:
            return transaction
        transaction.buyer_completed_at = timestamp
    create_domain_audit_log(
        db,
        action="transaction_completion_confirmed",
        user_id=user.id,
        auction_id=transaction.auction_id,
        metadata={"transaction_id": transaction.id},
    )
    from app.services.notifications import create_notification

    partner_id = transaction.buyer_id if transaction.seller_id == user.id else transaction.seller_id
    create_notification(
        db,
        user_id=partner_id,
        auction_id=transaction.auction_id,
        notification_type="transaction_confirmation",
        title="A partnered megerősítette a teljesítést",
        message=f"A(z) {transaction.auction.title} tranzakciónál most a te megerősítésedre várunk.",
    )
    if transaction.seller_completed_at and transaction.buyer_completed_at:
        transaction.status = "completed"
        transaction.completed_at = timestamp
        transaction.review_deadline = timestamp + timedelta(days=settings.transaction_review_window_days)
        create_domain_audit_log(db, action="transaction_completed", auction_id=transaction.auction_id, metadata={"transaction_id": transaction.id})
        for participant_id in (transaction.seller_id, transaction.buyer_id):
            create_notification(
                db,
                user_id=participant_id,
                auction_id=transaction.auction_id,
                notification_type="transaction_completed",
                title="A tranzakció sikeresen teljesült",
                message=f"Most már értékelhetitek egymást: {transaction.auction.title}",
            )
    db.add(transaction)
    db.commit()
    return get_participant_transaction(db, transaction.id, user.id)


def require_reviewable_transaction(db: Session, auction: Auction, user_id: int) -> AuctionTransaction:
    transaction = db.scalar(
        select(AuctionTransaction).where(
            AuctionTransaction.auction_id == auction.id,
            or_(AuctionTransaction.seller_id == user_id, AuctionTransaction.buyer_id == user_id),
        )
    )
    if transaction is None or transaction.status not in {"completed", "reviewed"}:
        raise HTTPException(status_code=409, detail="Értékelés csak kölcsönösen teljesített tranzakció után adható.")
    if transaction.review_deadline and transaction.review_deadline <= now_utc():
        raise HTTPException(status_code=409, detail="Az értékelési időszak lezárult.")
    return transaction


def can_user_review_transaction(db: Session, auction: Auction, user_id: int) -> bool:
    transaction = db.scalar(
        select(AuctionTransaction).where(
            AuctionTransaction.auction_id == auction.id,
            or_(AuctionTransaction.seller_id == user_id, AuctionTransaction.buyer_id == user_id),
        )
    )
    if transaction is None or transaction.status not in {"completed", "reviewed"}:
        return False
    if transaction.review_deadline and transaction.review_deadline <= now_utc():
        return False
    return db.scalar(select(AuctionReview.id).where(AuctionReview.auction_id == auction.id, AuctionReview.reviewer_id == user_id).limit(1)) is None


def mark_reviewed_if_complete(db: Session, transaction: AuctionTransaction) -> None:
    review_count = int(db.scalar(select(func.count()).select_from(AuctionReview).where(AuctionReview.auction_id == transaction.auction_id)) or 0)
    if review_count >= 2 and transaction.status == "completed":
        transaction.status = "reviewed"
        db.add(transaction)
        create_domain_audit_log(db, action="transaction_reviewed", auction_id=transaction.auction_id, metadata={"transaction_id": transaction.id})


def archive_due_transactions(db: Session, limit: int = 100) -> int:
    current_time = now_utc()
    statement = (
        select(AuctionTransaction)
        .where(
            AuctionTransaction.status.in_(["completed", "reviewed"]),
            or_(AuctionTransaction.status == "reviewed", and_(AuctionTransaction.review_deadline.is_not(None), AuctionTransaction.review_deadline <= current_time)),
        )
        .order_by(AuctionTransaction.updated_at.asc(), AuctionTransaction.id.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    archived = 0
    for transaction in db.scalars(statement).all():
        transaction.status = "archived"
        transaction.archived_at = current_time
        db.add(transaction)
        create_domain_audit_log(db, action="transaction_archived", auction_id=transaction.auction_id, metadata={"transaction_id": transaction.id})
        archived += 1
    return archived
