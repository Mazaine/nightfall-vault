from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.db.session import SessionLocal, get_db
from app.dependencies.auth import require_active_user
from app.models.user import User
from app.models.auction import Bid
from app.schemas.auction import BidWithdrawalRequest, BidWithdrawalResponse
from app.services.bidding import withdraw_bid
from app.services.security_audit import create_domain_audit_log

router = APIRouter(prefix="/api/bids", tags=["bids"])


@router.post("/{bid_id}/withdraw", response_model=BidWithdrawalResponse)
def withdraw_own_bid(
    bid_id: int,
    payload: BidWithdrawalRequest,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> BidWithdrawalResponse:
    check_rate_limit(request, "bid:withdraw", settings.bid_withdrawal_rate_limit_per_minute, str(current_user.id))
    audit_context = {
        "ip_address": get_client_ip(request),
        "user_agent": request.headers.get("user-agent"),
        "request_id": getattr(request.state, "request_id", None),
    }
    try:
        return BidWithdrawalResponse.model_validate(withdraw_bid(
            db, bid_id=bid_id, bidder=current_user, reason_code=payload.reason_code,
            reason_text=payload.reason_text, audit_context=audit_context,
        ))
    except HTTPException as exc:
        db.rollback()
        auction_id = db.scalar(select(Bid.auction_id).where(Bid.id == bid_id))
        audit_db = SessionLocal()
        try:
            create_domain_audit_log(
                audit_db, action="auction_bid_withdrawal_rejected", user_id=current_user.id, auction_id=auction_id,
                metadata={"bid_id": bid_id, "reason": str(exc.detail), **audit_context},
            )
            audit_db.commit()
        finally:
            audit_db.close()
        raise
