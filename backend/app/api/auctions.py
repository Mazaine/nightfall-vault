import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.dependencies.auth import get_optional_current_user, require_active_user, require_admin
from app.models.auction import Auction, AuctionBidExclusion, AuctionMessage, AuctionReview, Bid, WatchlistItem
from app.models.notification import Notification
from app.models.transaction import AuctionTransaction
from app.models.user import User
from app.schemas.auction import AuctionConversationRead, AuctionCreate, AuctionFinalizeRequest, AuctionImageRead, AuctionListItem, AuctionListPage, AuctionMessageCreate, AuctionMessageRead, AuctionRealtimeSnapshot, AuctionResponse, AuctionReviewCreate, AuctionReviewPage, AuctionReviewRead, AuctionStatusResponse, AuctionUpdate, BidCreate, BidHistoryItem, BidRead, MyBidAuctionItem, MyBidAuctionPage, NotificationRead, UserSummary
from app.services.auction_images import add_auction_image, delete_auction_image, set_cover_image
from app.services.auction_lifecycle import PUBLIC_AUCTION_STATUSES, activate_auction, can_access_post_auction_features, cancel_auction, create_auction, create_message, create_review, finalize_auction, get_auction_or_404, get_auction_statement, is_chat_read_only, require_can_view_auction, require_post_auction_participant, sync_auction_status, update_auction
from app.services.bidding import auction_realtime_snapshot, bid_history_item_for_user, bid_to_read, bid_withdrawal_state, list_bid_history, place_bid
from app.services.notifications import notify_followers_new_auction
from app.services.membership import featured_auction_order, is_vip
from app.services.recommendations import related_auctions, seller_other_auctions
from app.services.saved_searches import notify_saved_search_matches
from app.services.transactions import can_user_review_transaction
from app.services.realtime import iter_stream
from app.storage.paths import media_url

router = APIRouter(prefix="/api/auctions", tags=["auctions"])


AUCTION_SORTS = {"newest", "oldest", "highest_price", "lowest_price", "most_bids", "fewest_bids", "soon_ending", "buy_now_first"}


def seller_rating_summary(db: Session, seller_id: int) -> tuple[float | None, int]:
    average, count = db.query(func.avg(AuctionReview.rating), func.count(AuctionReview.id)).filter(AuctionReview.reviewed_user_id == seller_id).one()
    return (round(float(average), 2) if average is not None else None, int(count or 0))


def auction_list_item(
    auction: Auction,
    bid_count: int | None = None,
    *,
    db: Session | None = None,
    seller_average_rating: float | None = None,
    seller_review_count: int | None = None,
) -> AuctionListItem:
    count = sum(1 for bid in auction.bids if bid.status == "active") if bid_count is None else bid_count
    if db is not None and seller_review_count is None:
        seller_average_rating, seller_review_count = seller_rating_summary(db, auction.seller_id)
    return AuctionListItem.model_validate(auction).model_copy(update={
        "bid_count": count,
        "seller_average_rating": seller_average_rating,
        "seller_review_count": seller_review_count or 0,
        "is_featured": bool(auction.seller and is_vip(auction.seller)),
    })


def _escaped_contains(value: str) -> str:
    return f"%{value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')}%"


def _apply_auction_filters(query, *, query_text, title, description, seller, category, condition, status_filter, min_price, max_price, min_bids, max_bids, buy_now, soon_ending, new_only):
    now = datetime.now(timezone.utc)
    open_transaction = exists(select(AuctionTransaction.id).where(
        AuctionTransaction.auction_id == Auction.id,
        AuctionTransaction.status == "transaction_open",
    ))
    query = query.filter(
        or_(
            Auction.status.in_(("scheduled", "active", "ended")),
            and_(Auction.status == "sold", open_transaction),
        ),
        Auction.deleted_at.is_(None),
    )
    if query_text:
        pattern = _escaped_contains(query_text)
        query = query.filter(or_(Auction.title.ilike(pattern, escape="\\"), Auction.description.ilike(pattern, escape="\\"), User.username.ilike(pattern, escape="\\"), User.full_name.ilike(pattern, escape="\\")))
    if title:
        query = query.filter(Auction.title.ilike(_escaped_contains(title), escape="\\"))
    if description:
        query = query.filter(Auction.description.ilike(_escaped_contains(description), escape="\\"))
    if seller:
        pattern = _escaped_contains(seller)
        query = query.filter(or_(User.username.ilike(pattern, escape="\\"), User.full_name.ilike(pattern, escape="\\")))
    if category:
        query = query.filter(Auction.category == category)
    if condition:
        query = query.filter(Auction.condition == condition)
    if status_filter:
        if status_filter not in PUBLIC_AUCTION_STATUSES:
            raise HTTPException(status_code=422, detail="Érvénytelen aukcióállapot.")
        query = query.filter(Auction.status == status_filter)
    if min_price is not None:
        query = query.filter(Auction.current_price >= min_price)
    if max_price is not None:
        query = query.filter(Auction.current_price <= max_price)
    if buy_now is not None:
        query = query.filter(Auction.buy_now_enabled.is_(buy_now))
    if soon_ending:
        query = query.filter(Auction.ends_at <= now + timedelta(hours=24), Auction.ends_at >= now)
    if new_only:
        query = query.filter(Auction.created_at >= now - timedelta(days=7))
    if min_bids is not None:
        query = query.having(func.count(Bid.id) >= min_bids)
    if max_bids is not None:
        query = query.having(func.count(Bid.id) <= max_bids)
    return query


def _apply_auction_sort(query, sort: str):
    bid_count = func.count(Bid.id)
    status_last = case(
        (Auction.status == "active", 0),
        (Auction.status == "scheduled", 1),
        (Auction.status == "ended", 2),
        (Auction.status == "sold", 3),
        else_=4,
    )
    featured_first = featured_auction_order()
    if sort == "oldest":
        return query.order_by(status_last, featured_first, Auction.created_at.asc(), Auction.id.asc())
    if sort == "highest_price":
        return query.order_by(status_last, featured_first, Auction.current_price.desc(), Auction.id.desc())
    if sort == "lowest_price":
        return query.order_by(status_last, featured_first, Auction.current_price.asc(), Auction.id.asc())
    if sort == "most_bids":
        return query.order_by(status_last, featured_first, bid_count.desc(), Auction.id.desc())
    if sort == "fewest_bids":
        return query.order_by(status_last, featured_first, bid_count.asc(), Auction.id.asc())
    if sort == "soon_ending":
        return query.order_by(status_last, featured_first, Auction.ends_at.asc(), Auction.id.asc())
    if sort == "buy_now_first":
        return query.order_by(status_last, featured_first, Auction.buy_now_enabled.desc(), Auction.created_at.desc(), Auction.id.desc())
    return query.order_by(status_last, featured_first, Auction.created_at.desc(), Auction.id.desc())


def auction_response(auction: Auction, user: User | None = None, db: Session | None = None) -> AuctionResponse:
    seller_average_rating, seller_review_count = seller_rating_summary(db, auction.seller_id) if db is not None else (None, 0)
    response = AuctionResponse.model_validate(auction).model_copy(update={"seller_average_rating": seller_average_rating, "seller_review_count": seller_review_count, "is_featured": bool(auction.seller and is_vip(auction.seller))})
    if user is None:
        return response
    return response.model_copy(
        update={
            "is_owner": auction.seller_id == user.id,
            "can_chat": can_access_post_auction_features(auction, user.id),
            "chat_read_only": bool(db is not None and can_access_post_auction_features(auction, user.id) and is_chat_read_only(db, auction)),
            "can_review": bool(db is not None and can_user_review_transaction(db, auction, user.id)),
        },
    )


@router.get("", response_model=AuctionListPage)
def list_public_auctions(
    query_text: str | None = Query(default=None, alias="q", max_length=180),
    title: str | None = Query(default=None, max_length=180),
    description: str | None = Query(default=None, max_length=180),
    seller: str | None = Query(default=None, max_length=80),
    category: str | None = None,
    condition: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    min_bids: int | None = Query(default=None, ge=0),
    max_bids: int | None = Query(default=None, ge=0),
    buy_now: bool | None = None,
    soon_ending: bool = False,
    new_only: bool = False,
    sort: str = Query(default="newest"),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> AuctionListPage:
    if sort not in AUCTION_SORTS:
        raise HTTPException(status_code=422, detail="Érvénytelen rendezés.")
    base_query = db.query(Auction.id, func.count(Bid.id).label("bid_count")).join(User, User.id == Auction.seller_id).outerjoin(Bid, and_(Bid.auction_id == Auction.id, Bid.status == "active")).group_by(Auction.id, User.vip_expires_at)
    filtered_query = _apply_auction_filters(
        base_query,
        query_text=query_text,
        title=title,
        description=description,
        seller=seller,
        category=category,
        condition=condition,
        status_filter=status_filter,
        min_price=min_price,
        max_price=max_price,
        min_bids=min_bids,
        max_bids=max_bids,
        buy_now=buy_now,
        soon_ending=soon_ending,
        new_only=new_only,
    )
    total = filtered_query.count()
    rows = _apply_auction_sort(filtered_query, sort).offset(offset).limit(limit).all()
    auction_ids = [row.id for row in rows]
    bid_counts = {row.id: int(row.bid_count or 0) for row in rows}
    if not auction_ids:
        return AuctionListPage(items=[], total=total, limit=limit, offset=offset)
    list_statement = select(Auction).options(selectinload(Auction.seller), selectinload(Auction.images)).where(Auction.id.in_(auction_ids))
    auctions_by_id = {auction.id: auction for auction in db.scalars(list_statement).all()}
    seller_ids = {auction.seller_id for auction in auctions_by_id.values()}
    rating_rows = db.query(
        AuctionReview.reviewed_user_id,
        func.avg(AuctionReview.rating),
        func.count(AuctionReview.id),
    ).filter(AuctionReview.reviewed_user_id.in_(seller_ids)).group_by(AuctionReview.reviewed_user_id).all() if seller_ids else []
    seller_ratings = {user_id: (round(float(average), 2), int(count)) for user_id, average, count in rating_rows}
    items: list[AuctionListItem] = []
    for auction_id in auction_ids:
        auction = auctions_by_id.get(auction_id)
        if auction is None:
            continue
        auction = sync_auction_status(db, auction)
        if auction.status in PUBLIC_AUCTION_STATUSES:
            average, review_count = seller_ratings.get(auction.seller_id, (None, 0))
            items.append(auction_list_item(auction, bid_counts.get(auction.id, 0), seller_average_rating=average, seller_review_count=review_count))
    return AuctionListPage(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=AuctionResponse, status_code=status.HTTP_201_CREATED)
def create_my_auction(
    auction_create: AuctionCreate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionResponse:
    auction = create_auction(db=db, auction_create=auction_create, seller=current_user)
    return auction_response(get_auction_or_404(db, auction.id), current_user, db)


@router.get("/me", response_model=list[AuctionListItem])
def list_my_auctions(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[AuctionListItem]:
    statement = get_auction_statement().where(Auction.seller_id == current_user.id, Auction.deleted_at.is_(None)).order_by(featured_auction_order(), Auction.created_at.desc(), Auction.id.desc())
    return [auction_list_item(sync_auction_status(db, auction), db=db) for auction in db.scalars(statement).all()]


@router.get("/me/conversations", response_model=list[AuctionConversationRead])
def list_my_auction_conversations(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> list[AuctionConversationRead]:
    statement = (
        get_auction_statement()
        .where(
            Auction.status == "sold",
            Auction.finalized_at.is_not(None),
            Auction.deleted_at.is_(None),
            or_(Auction.seller_id == current_user.id, Auction.winner_id == current_user.id),
        )
        .order_by(Auction.finalized_at.desc(), Auction.id.desc())
    )
    conversations: list[AuctionConversationRead] = []
    for auction in db.scalars(statement).all():
        is_seller = auction.seller_id == current_user.id
        counterparty = auction.winner if is_seller else auction.seller
        if counterparty is None or auction.finalized_at is None:
            continue
        cover = next((image for image in auction.images if image.is_cover), None)
        cover = cover or (auction.images[0] if auction.images else None)
        last_message = auction.messages[-1] if auction.messages else None
        conversations.append(
            AuctionConversationRead(
                auction_id=auction.id,
                auction_title=auction.title,
                auction_image_url=media_url(cover.list_storage_key or cover.storage_key) if cover else None,
                role="seller" if is_seller else "winner",
                counterparty=UserSummary.model_validate(counterparty),
                message_count=len(auction.messages),
                last_message=last_message.message if last_message else None,
                last_message_at=last_message.created_at if last_message else None,
                finalized_at=auction.finalized_at,
            ),
        )
    return conversations


@router.get("/my-bids", response_model=list[MyBidAuctionItem])
def list_my_bid_auctions(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[MyBidAuctionItem]:
    bid_statement = select(Bid.auction_id).where(Bid.bidder_id == current_user.id, Bid.status == "active").distinct()
    auction_ids = [row[0] for row in db.execute(bid_statement).all()]
    if not auction_ids:
        return []
    statement = get_auction_statement().where(Auction.id.in_(auction_ids), Auction.deleted_at.is_(None)).order_by(featured_auction_order(), Auction.ends_at.asc(), Auction.id.asc())
    items: list[MyBidAuctionItem] = []
    for auction in db.scalars(statement).all():
        auction = sync_auction_status(db, auction)
        my_highest_bid = db.scalar(select(Bid.amount).where(Bid.auction_id == auction.id, Bid.bidder_id == current_user.id, Bid.status == "active").order_by(Bid.amount.desc()).limit(1))
        if my_highest_bid is None:
            continue
        my_last_bid_at = db.scalar(select(Bid.created_at).where(Bid.auction_id == auction.id, Bid.bidder_id == current_user.id, Bid.status == "active").order_by(Bid.created_at.desc(), Bid.id.desc()).limit(1))
        transaction_id = db.scalar(select(AuctionTransaction.id).where(
            AuctionTransaction.auction_id == auction.id,
            or_(AuctionTransaction.seller_id == current_user.id, AuctionTransaction.buyer_id == current_user.id),
        ).limit(1))
        is_leading = auction.highest_bid is not None and auction.highest_bid.bidder_id == current_user.id
        has_won = auction.status == "sold" and auction.winner_id == current_user.id
        items.append(
            MyBidAuctionItem(
                auction=auction_list_item(auction, db=db),
                my_highest_bid=my_highest_bid,
                is_leading=is_leading,
                has_won=has_won,
                is_outbid=not is_leading and auction.status in {"active", "scheduled", "ended"},
                my_last_bid_at=my_last_bid_at,
                transaction_id=transaction_id,
            ),
        )
    return items


@router.get("/my-bids/page", response_model=MyBidAuctionPage)
def list_my_bid_auctions_page(
    state: str = Query(default="all"),
    limit: int = Query(default=12, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> MyBidAuctionPage:
    if state not in {"all", "outbid", "leading", "watched", "won", "lost"}:
        raise HTTPException(status_code=422, detail="Érvénytelen licitállapot-szűrő.")
    candidate_ids = set(db.scalars(select(Bid.auction_id).where(Bid.bidder_id == current_user.id)).all())
    watched_ids = set(db.scalars(select(WatchlistItem.auction_id).where(WatchlistItem.user_id == current_user.id)).all())
    exited_ids = set(db.scalars(select(AuctionBidExclusion.auction_id).where(AuctionBidExclusion.user_id == current_user.id)).all())
    candidate_ids.update(watched_ids)
    candidate_ids.update(exited_ids)
    if not candidate_ids:
        return MyBidAuctionPage(items=[], total=0, limit=limit, offset=offset, server_time=datetime.now(timezone.utc))
    auctions = list(db.scalars(get_auction_statement().where(Auction.id.in_(candidate_ids), Auction.deleted_at.is_(None))).unique().all())
    transaction_ids = dict(db.execute(select(AuctionTransaction.auction_id, AuctionTransaction.id).where(
        AuctionTransaction.auction_id.in_(candidate_ids),
        or_(AuctionTransaction.seller_id == current_user.id, AuctionTransaction.buyer_id == current_user.id),
    )).all())
    items: list[MyBidAuctionItem] = []
    for auction in auctions:
        auction = sync_auction_status(db, auction)
        own_bids = list(db.scalars(select(Bid).where(Bid.auction_id == auction.id, Bid.bidder_id == current_user.id).order_by(Bid.created_at.desc(), Bid.id.desc())).all())
        top_own = next((bid for bid in own_bids if bid.status == "active"), None)
        is_leading = bool(top_own and auction.highest_bid_id == top_own.id)
        has_won = auction.status == "sold" and auction.winner_id == current_user.id
        has_exited = auction.id in exited_ids
        is_watched = auction.id in watched_ids
        is_open = auction.status in {"scheduled", "active", "ended"}
        is_outbid = bool(top_own and not is_leading and is_open and not has_exited)
        is_lost = has_exited or (bool(own_bids) and not has_won and not is_open)
        if state == "leading" and not is_leading: continue
        if state == "outbid" and not is_outbid: continue
        if state == "watched" and not is_watched: continue
        if state == "won" and not has_won: continue
        if state == "lost" and not is_lost: continue
        withdrawal = bid_withdrawal_state(top_own, auction, current_user) if top_own else {"can_withdraw": False, "withdrawal_block_reason": None}
        items.append(MyBidAuctionItem(
            auction=auction_list_item(auction, db=db), my_highest_bid=top_own.amount if top_own else None,
            is_leading=is_leading, has_won=has_won, is_outbid=is_outbid,
            my_last_bid_at=own_bids[0].created_at if own_bids else None,
            transaction_id=transaction_ids.get(auction.id), top_bid_id=top_own.id if top_own else None,
            can_withdraw=withdrawal["can_withdraw"], withdrawal_block_reason=withdrawal["withdrawal_block_reason"],
            has_exited=has_exited, is_watched=is_watched,
            participation_note="Kiszálltál ebből az aukcióból." if has_exited else None,
        ))
    items.sort(key=lambda item: (0 if item.is_outbid else 1 if item.is_leading else 2 if item.is_watched else 3, item.auction.ends_at, item.auction.id))
    total = len(items)
    return MyBidAuctionPage(items=items[offset:offset + limit], total=total, limit=limit, offset=offset, server_time=datetime.now(timezone.utc))


@router.get("/notifications", response_model=list[NotificationRead])
def list_my_notifications(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[NotificationRead]:
    statement = select(Notification).where(Notification.user_id == current_user.id).order_by(Notification.created_at.desc(), Notification.id.desc())
    return [NotificationRead.model_validate(notification) for notification in db.scalars(statement).all()]


@router.get("/{auction_id}", response_model=AuctionResponse)
def get_auction(
    auction_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> AuctionResponse:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    return auction_response(auction, current_user, db)


@router.patch("/{auction_id}", response_model=AuctionResponse)
def update_my_auction(
    auction_id: int,
    auction_update: AuctionUpdate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionResponse:
    auction = get_auction_or_404(db, auction_id)
    updated = update_auction(db=db, auction=auction, auction_update=auction_update, user=current_user)
    return auction_response(get_auction_or_404(db, updated.id), current_user, db)


@router.post("/{auction_id}/activate", response_model=AuctionStatusResponse)
def activate_my_auction(
    auction_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = get_auction_or_404(db, auction_id)
    activated = activate_auction(db=db, auction=auction, user=current_user)
    if activated.status in {"scheduled", "active"}:
        notify_followers_new_auction(db, activated)
        notify_saved_search_matches(db, activated)
        db.commit()
    return AuctionStatusResponse.model_validate(activated)


@router.get("/{auction_id}/related", response_model=list[AuctionListItem])
def list_related_auctions(auction_id: int, current_user: User | None = Depends(get_optional_current_user), db: Session = Depends(get_db)) -> list[AuctionListItem]:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    return [auction_list_item(item, sum(1 for bid in item.bids if bid.status == "active"), db=db) for item in related_auctions(db, auction)]


@router.get("/{auction_id}/seller-auctions", response_model=list[AuctionListItem])
def list_seller_other_auctions(auction_id: int, current_user: User | None = Depends(get_optional_current_user), db: Session = Depends(get_db)) -> list[AuctionListItem]:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    return [auction_list_item(item, sum(1 for bid in item.bids if bid.status == "active"), db=db) for item in seller_other_auctions(db, auction, limit=6)]


@router.post("/{auction_id}/cancel", response_model=AuctionStatusResponse)
def cancel_my_auction(
    auction_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = get_auction_or_404(db, auction_id)
    cancelled = cancel_auction(db=db, auction=auction, user=current_user)
    return AuctionStatusResponse.model_validate(cancelled)


@router.get("/{auction_id}/status", response_model=AuctionStatusResponse)
def get_auction_status(
    auction_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    return AuctionStatusResponse.model_validate(auction)


@router.get("/{auction_id}/bids", response_model=list[BidHistoryItem])
def list_auction_bids(
    auction_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> list[BidHistoryItem]:
    auction = get_auction_or_404(db, auction_id)
    bids = list_bid_history(db=db, auction=auction, user=current_user)
    return [BidHistoryItem.model_validate(bid_history_item_for_user(bid, auction, current_user)) for bid in bids]


@router.get("/realtime/stream")
async def stream_auction_list_updates(request: Request) -> StreamingResponse:
    check_rate_limit(request, "sse:auctions", settings.sse_connection_rate_limit_per_minute)
    async def events():
        async for event_id, event_type, payload in iter_stream("nightfall:realtime:auctions", request.headers.get("last-event-id", "$")):
            if await request.is_disconnected():
                break
            yield f"id: {event_id}\nevent: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{auction_id}/stream")
async def stream_auction_updates(
    auction_id: int,
    request: Request,
    once: bool = False,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    check_rate_limit(request, "sse:auction", settings.sse_connection_rate_limit_per_minute)

    initial = AuctionRealtimeSnapshot.model_validate(auction_realtime_snapshot(db, auction)).model_dump(mode="json")

    async def event_generator():
        yield f"event: auction_update\ndata: {json.dumps(initial, ensure_ascii=False)}\n\n"
        if once:
            return
        last_event_id = request.headers.get("last-event-id", "$")
        async for event_id, event_type, payload in iter_stream(f"nightfall:realtime:auction:{auction_id}", last_event_id):
            if await request.is_disconnected():
                break
            yield f"id: {event_id}\nevent: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{auction_id}/bids", response_model=BidRead, status_code=status.HTTP_201_CREATED)
def place_auction_bid(
    auction_id: int,
    bid_create: BidCreate,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> BidRead:
    check_rate_limit(request, "auction:bid", settings.bid_rate_limit_per_minute, str(current_user.id))
    bid, auction = place_bid(db=db, auction_id=auction_id, bidder=current_user, amount=bid_create.amount)
    return BidRead.model_validate(bid_to_read(bid, auction))


@router.post("/{auction_id}/admin/finalize", response_model=AuctionStatusResponse)
def admin_finalize_auction(
    auction_id: int,
    finalize_request: AuctionFinalizeRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = get_auction_or_404(db, auction_id)
    winner = db.get(User, finalize_request.winner_id) if finalize_request.winner_id is not None else None
    if finalize_request.winner_id is not None and winner is None:
        raise HTTPException(status_code=404, detail="A nyertes nem található.")
    finalized = finalize_auction(db=db, auction=auction, final_status=finalize_request.status, winner=winner, admin_user=current_user)
    return AuctionStatusResponse.model_validate(finalized)


@router.get("/{auction_id}/images", response_model=list[AuctionImageRead])
def list_auction_images(
    auction_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> list[AuctionImageRead]:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    return [AuctionImageRead.model_validate(image) for image in auction.images]


@router.post("/{auction_id}/images", response_model=AuctionImageRead, status_code=status.HTTP_201_CREATED)
async def upload_auction_image(
    auction_id: int,
    image: UploadFile = File(...),
    is_cover: bool = False,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionImageRead:
    auction = get_auction_or_404(db, auction_id)
    created_image = await add_auction_image(db=db, auction=auction, upload=image, user=current_user, is_cover=is_cover)
    return AuctionImageRead.model_validate(created_image)


@router.post("/{auction_id}/images/{image_id}/cover", response_model=AuctionImageRead)
def set_auction_cover_image(
    auction_id: int,
    image_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionImageRead:
    auction = get_auction_or_404(db, auction_id)
    image = set_cover_image(db=db, auction=auction, image_id=image_id, user=current_user)
    return AuctionImageRead.model_validate(image)


@router.delete("/{auction_id}/images/{image_id}", response_model=AuctionImageRead)
def delete_my_auction_image(
    auction_id: int,
    image_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionImageRead:
    auction = get_auction_or_404(db, auction_id)
    image = delete_auction_image(db=db, auction=auction, image_id=image_id, user=current_user)
    return AuctionImageRead.model_validate(image)


@router.get("/{auction_id}/messages", response_model=list[AuctionMessageRead])
def list_auction_messages(
    auction_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> list[AuctionMessageRead]:
    auction = get_auction_or_404(db, auction_id)
    require_post_auction_participant(auction, current_user)
    statement = select(AuctionMessage).where(AuctionMessage.auction_id == auction.id).order_by(AuctionMessage.created_at.asc(), AuctionMessage.id.asc())
    return [AuctionMessageRead.model_validate(message) for message in db.scalars(statement).all()]


@router.post("/{auction_id}/messages", response_model=AuctionMessageRead, status_code=status.HTTP_201_CREATED)
def create_auction_message(
    auction_id: int,
    message_create: AuctionMessageCreate,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionMessageRead:
    check_rate_limit(request, "auction:message", settings.chat_message_rate_limit_per_minute, str(current_user.id))
    auction = get_auction_or_404(db, auction_id)
    message = create_message(db=db, auction=auction, sender=current_user, message=message_create.message)
    return AuctionMessageRead.model_validate(message)


@router.get("/{auction_id}/reviews", response_model=AuctionReviewPage)
def list_auction_reviews(
    auction_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="newest"),
    db: Session = Depends(get_db),
) -> AuctionReviewPage:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    query = db.query(AuctionReview).filter(AuctionReview.auction_id == auction.id)
    total = query.count()
    if sort == "oldest":
        query = query.order_by(AuctionReview.created_at.asc(), AuctionReview.id.asc())
    elif sort == "rating_high":
        query = query.order_by(AuctionReview.rating.desc(), AuctionReview.created_at.desc(), AuctionReview.id.desc())
    elif sort == "rating_low":
        query = query.order_by(AuctionReview.rating.asc(), AuctionReview.created_at.desc(), AuctionReview.id.desc())
    elif sort == "newest":
        query = query.order_by(AuctionReview.created_at.desc(), AuctionReview.id.desc())
    else:
        raise HTTPException(status_code=422, detail="Érvénytelen rendezés.")
    reviews = query.offset(offset).limit(limit).all()
    return AuctionReviewPage(items=[AuctionReviewRead.model_validate(review) for review in reviews], total=total, limit=limit, offset=offset)


@router.post("/{auction_id}/reviews", response_model=AuctionReviewRead, status_code=status.HTTP_201_CREATED)
def create_auction_review(
    auction_id: int,
    review_create: AuctionReviewCreate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionReviewRead:
    auction = get_auction_or_404(db, auction_id)
    review = create_review(db=db, auction=auction, reviewer=current_user, rating=review_create.rating, comment=review_create.comment)
    return AuctionReviewRead.model_validate(review)
