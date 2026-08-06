import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.core.rate_limit import check_rate_limit
from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.auction import Auction, AuctionMessage
from app.models.user import User
from app.services.auction_lifecycle import get_auction_counterparty, get_auction_or_404, require_post_auction_participant
from app.services.demo_visibility import auction_visibility_clause
from app.services.notifications import now_utc
from app.services.realtime import get_presence, iter_stream, publish_user_event, set_presence

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


def sse(event_id: str, event_type: str, payload: dict) -> str:
    return f"id: {event_id}\nevent: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/stream")
async def user_stream(
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    check_rate_limit(request, "sse:user", settings.sse_connection_rate_limit_per_minute, str(current_user.id))
    last_event_id = request.headers.get("last-event-id", "$")
    session_version = current_user.auth_version

    async def events():
        async for event_id, event_type, payload in iter_stream(f"nightfall:realtime:user:{current_user.id}", last_event_id):
            if await request.is_disconnected():
                break
            still_valid = db.scalar(select(User.id).where(
                User.id == current_user.id,
                User.auth_version == session_version,
                User.deleted_at.is_(None),
                User.is_active.is_(True),
            ))
            if still_valid is None:
                break
            yield sse(event_id, event_type, payload)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/heartbeat")
def heartbeat(request: Request, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    check_rate_limit(request, "realtime:heartbeat", settings.realtime_heartbeat_rate_limit_per_minute, str(current_user.id))
    presence = set_presence(current_user.id)
    auctions = db.scalars(select(Auction).where(
        Auction.status == "sold",
        or_(Auction.seller_id == current_user.id, Auction.winner_id == current_user.id),
        auction_visibility_clause(current_user),
    )).all()
    for auction in auctions:
        counterpart_id = auction.winner_id if auction.seller_id == current_user.id else auction.seller_id
        if counterpart_id is not None:
            publish_user_event(counterpart_id, "presence", {**presence, "auction_id": auction.id})
    return presence


@router.get("/auctions/{auction_id}/presence")
def auction_presence(auction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    auction = get_auction_or_404(db, auction_id)
    require_post_auction_participant(auction, current_user)
    return get_presence(get_auction_counterparty(auction, current_user.id))


@router.post("/auctions/{auction_id}/typing")
def typing(auction_id: int, request: Request, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    auction = get_auction_or_404(db, auction_id)
    require_post_auction_participant(auction, current_user)
    check_rate_limit(request, "chat-typing", limit=20, identifier=f"{current_user.id}:{auction_id}")
    recipient_id = get_auction_counterparty(auction, current_user.id)
    publish_user_event(recipient_id, "typing", {"auction_id": auction.id, "user_id": current_user.id, "username": current_user.full_name or current_user.username})
    return {"sent": True}


@router.post("/auctions/{auction_id}/messages/read")
def mark_messages_read(auction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    auction = get_auction_or_404(db, auction_id)
    require_post_auction_participant(auction, current_user)
    read_at = now_utc()
    result = db.execute(update(AuctionMessage).where(AuctionMessage.auction_id == auction.id, AuctionMessage.sender_id != current_user.id, AuctionMessage.read_at.is_(None)).values(read_at=read_at))
    db.commit()
    publish_user_event(get_auction_counterparty(auction, current_user.id), "messages_read", {"auction_id": auction.id, "read_at": read_at.isoformat()})
    return {"updated": int(result.rowcount or 0), "read_at": read_at}
