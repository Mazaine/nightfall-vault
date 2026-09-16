from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.transaction import AuctionTransaction
from app.models.auction import Auction
from app.models.user import User
from app.schemas.transaction import AuctionTransactionPage, AuctionTransactionRead, TransactionNoteUpdate
from app.services.transactions import confirm_completion, get_participant_transaction, hide_closed_transaction, is_transaction_hidden_for, serialize_transaction, transaction_options, update_transaction_note, visible_transaction_filters
from app.services.demo_visibility import require_demo_auction_access


router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=AuctionTransactionPage)
def list_my_transactions(
    status_filter: str | None = Query(default=None, alias="status", max_length=30),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionTransactionPage:
    query = db.query(AuctionTransaction).join(Auction, Auction.id == AuctionTransaction.auction_id).options(*transaction_options()).filter(*visible_transaction_filters(current_user))
    if status_filter:
        query = query.filter(AuctionTransaction.status == status_filter)
    total = query.count()
    items = query.order_by(AuctionTransaction.updated_at.desc(), AuctionTransaction.id.desc()).offset(offset).limit(limit).all()
    return AuctionTransactionPage(items=[AuctionTransactionRead.model_validate(serialize_transaction(item, current_user.id)) for item in items], total=total, limit=limit, offset=offset)


@router.get("/{transaction_id}", response_model=AuctionTransactionRead)
def get_my_transaction(transaction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    transaction = get_participant_transaction(db, transaction_id, current_user.id)
    if is_transaction_hidden_for(transaction, current_user.id):
        raise HTTPException(status_code=404, detail="A tranzakció nem található.")
    require_demo_auction_access(transaction.auction, current_user)
    return AuctionTransactionRead.model_validate(serialize_transaction(transaction, current_user.id))


@router.post("/{transaction_id}/confirm-completion", response_model=AuctionTransactionRead)
def confirm_my_transaction(transaction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    transaction = confirm_completion(db, transaction_id, current_user)
    require_demo_auction_access(transaction.auction, current_user)
    return AuctionTransactionRead.model_validate(serialize_transaction(transaction, current_user.id))


@router.put("/{transaction_id}/note", response_model=AuctionTransactionRead)
def save_my_transaction_note(transaction_id: int, payload: TransactionNoteUpdate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    visible_transaction = get_participant_transaction(db, transaction_id, current_user.id)
    require_demo_auction_access(visible_transaction.auction, current_user)
    transaction = update_transaction_note(db, transaction_id, current_user, payload.note)
    return AuctionTransactionRead.model_validate(serialize_transaction(transaction, current_user.id))


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_closed_transaction(transaction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> Response:
    transaction = get_participant_transaction(db, transaction_id, current_user.id)
    require_demo_auction_access(transaction.auction, current_user)
    hide_closed_transaction(db, transaction_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
