from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.transaction import AuctionTransaction
from app.models.user import User
from app.schemas.transaction import AuctionTransactionPage, AuctionTransactionRead
from app.services.transactions import confirm_completion, get_participant_transaction, serialize_transaction, transaction_options


router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=AuctionTransactionPage)
def list_my_transactions(
    status_filter: str | None = Query(default=None, alias="status", max_length=30),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionTransactionPage:
    query = db.query(AuctionTransaction).options(*transaction_options()).filter(
        or_(AuctionTransaction.seller_id == current_user.id, AuctionTransaction.buyer_id == current_user.id)
    )
    if status_filter:
        query = query.filter(AuctionTransaction.status == status_filter)
    total = query.count()
    items = query.order_by(AuctionTransaction.updated_at.desc(), AuctionTransaction.id.desc()).offset(offset).limit(limit).all()
    return AuctionTransactionPage(items=[AuctionTransactionRead.model_validate(serialize_transaction(item, current_user.id)) for item in items], total=total, limit=limit, offset=offset)


@router.get("/{transaction_id}", response_model=AuctionTransactionRead)
def get_my_transaction(transaction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    transaction = get_participant_transaction(db, transaction_id, current_user.id)
    return AuctionTransactionRead.model_validate(serialize_transaction(transaction, current_user.id))


@router.post("/{transaction_id}/confirm-completion", response_model=AuctionTransactionRead)
def confirm_my_transaction(transaction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> AuctionTransactionRead:
    transaction = confirm_completion(db, transaction_id, current_user)
    return AuctionTransactionRead.model_validate(serialize_transaction(transaction, current_user.id))
