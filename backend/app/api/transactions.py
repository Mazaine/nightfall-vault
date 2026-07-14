from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.auction_transaction import AuctionTransaction
from app.models.user import User
from app.schemas.auction_transaction import AuctionTransactionRead, TransactionDisputeCreate, TransactionParticipantRead
from app.services.auction_transactions import confirm_handover, get_participant_transaction, list_user_transactions, open_dispute


router = APIRouter(prefix="/api/transactions", tags=["auction-transactions"])


def to_transaction_read(transaction: AuctionTransaction, user: User) -> AuctionTransactionRead:
    is_seller = transaction.seller_id == user.id
    counterparty = transaction.buyer if is_seller else transaction.seller
    cover = next((image for image in transaction.auction.images if image.is_cover), None)
    cover = cover or (transaction.auction.images[0] if transaction.auction.images else None)
    image_key = None if cover is None else (cover.list_storage_key or cover.storage_key)
    own_confirmed = transaction.seller_confirmed_at is not None if is_seller else transaction.buyer_confirmed_at is not None
    return AuctionTransactionRead(
        id=transaction.id,
        auction_id=transaction.auction_id,
        auction_title=transaction.auction.title,
        auction_image_key=image_key,
        amount=transaction.amount,
        status=transaction.status,
        role="seller" if is_seller else "buyer",
        counterparty=TransactionParticipantRead(username=counterparty.username, full_name=counterparty.full_name),
        seller_confirmed=transaction.seller_confirmed_at is not None,
        buyer_confirmed=transaction.buyer_confirmed_at is not None,
        can_confirm=transaction.status in {"awaiting_arrangement", "in_progress"} and not own_confirmed,
        can_dispute=transaction.status in {"awaiting_arrangement", "in_progress"},
        dispute_reason=transaction.dispute_reason,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
        completed_at=transaction.completed_at,
    )


@router.get("", response_model=list[AuctionTransactionRead])
def list_my_transactions(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[AuctionTransactionRead]:
    return [to_transaction_read(item, current_user) for item in list_user_transactions(db, current_user)]


@router.get("/{transaction_id}", response_model=AuctionTransactionRead)
def get_my_transaction(transaction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    return to_transaction_read(get_participant_transaction(db, transaction_id, current_user), current_user)


@router.post("/{transaction_id}/confirm", response_model=AuctionTransactionRead)
def confirm_my_transaction(transaction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    return to_transaction_read(confirm_handover(db, transaction_id, current_user), current_user)


@router.post("/{transaction_id}/disputes", response_model=AuctionTransactionRead)
def dispute_my_transaction(transaction_id: int, dispute: TransactionDisputeCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    return to_transaction_read(open_dispute(db, transaction_id, current_user, dispute.reason), current_user)
