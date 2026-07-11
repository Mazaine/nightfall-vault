from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_optional_current_user, require_active_user, require_admin
from app.models.auction import Auction, AuctionMessage, AuctionReview
from app.models.user import User
from app.schemas.auction import AuctionCreate, AuctionFinalizeRequest, AuctionImageRead, AuctionListItem, AuctionMessageCreate, AuctionMessageRead, AuctionResponse, AuctionReviewCreate, AuctionReviewRead, AuctionStatusResponse, AuctionUpdate, BidCreate, BidHistoryItem, BidRead
from app.services.auction_images import add_auction_image, delete_auction_image, set_cover_image
from app.services.auction_lifecycle import PUBLIC_AUCTION_STATUSES, activate_auction, can_access_post_auction_features, cancel_auction, create_auction, create_message, create_review, finalize_auction, get_auction_or_404, get_auction_statement, require_can_view_auction, require_post_auction_participant, sync_auction_status, update_auction
from app.services.bidding import bid_to_history_item, bid_to_read, list_bid_history, place_bid

router = APIRouter(prefix="/api/auctions", tags=["auctions"])


def auction_response(auction: Auction, user: User | None = None) -> AuctionResponse:
    response = AuctionResponse.model_validate(auction)
    if user is None:
        return response
    return response.model_copy(
        update={
            "is_owner": auction.seller_id == user.id,
            "can_chat": can_access_post_auction_features(auction, user.id),
            "can_review": can_access_post_auction_features(auction, user.id),
        },
    )


@router.get("", response_model=list[AuctionListItem])
def list_public_auctions(db: Session = Depends(get_db)) -> list[AuctionListItem]:
    statement = get_auction_statement().where(Auction.status.in_(PUBLIC_AUCTION_STATUSES)).order_by(Auction.created_at.desc(), Auction.id.desc())
    auctions = list(db.scalars(statement).all())
    return [AuctionListItem.model_validate(sync_auction_status(db, auction)) for auction in auctions if auction.status in PUBLIC_AUCTION_STATUSES]


@router.post("", response_model=AuctionResponse, status_code=status.HTTP_201_CREATED)
def create_my_auction(
    auction_create: AuctionCreate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionResponse:
    auction = create_auction(db=db, auction_create=auction_create, seller=current_user)
    return auction_response(get_auction_or_404(db, auction.id), current_user)


@router.get("/me", response_model=list[AuctionListItem])
def list_my_auctions(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[AuctionListItem]:
    statement = get_auction_statement().where(Auction.seller_id == current_user.id).order_by(Auction.created_at.desc(), Auction.id.desc())
    return [AuctionListItem.model_validate(sync_auction_status(db, auction)) for auction in db.scalars(statement).all()]


@router.get("/{auction_id}", response_model=AuctionResponse)
def get_auction(
    auction_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> AuctionResponse:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    return auction_response(auction, current_user)


@router.patch("/{auction_id}", response_model=AuctionResponse)
def update_my_auction(
    auction_id: int,
    auction_update: AuctionUpdate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionResponse:
    auction = get_auction_or_404(db, auction_id)
    updated = update_auction(db=db, auction=auction, auction_update=auction_update, user=current_user)
    return auction_response(get_auction_or_404(db, updated.id), current_user)


@router.post("/{auction_id}/activate", response_model=AuctionStatusResponse)
def activate_my_auction(
    auction_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionStatusResponse:
    auction = get_auction_or_404(db, auction_id)
    activated = activate_auction(db=db, auction=auction, user=current_user)
    return AuctionStatusResponse.model_validate(activated)


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
    return [BidHistoryItem.model_validate(bid_to_history_item(bid, auction)) for bid in bids]


@router.post("/{auction_id}/bids", response_model=BidRead, status_code=status.HTTP_201_CREATED)
def place_auction_bid(
    auction_id: int,
    bid_create: BidCreate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> BidRead:
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
        raise HTTPException(status_code=404, detail="Winner not found")
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
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuctionMessageRead:
    auction = get_auction_or_404(db, auction_id)
    message = create_message(db=db, auction=auction, sender=current_user, message=message_create.message)
    return AuctionMessageRead.model_validate(message)


@router.get("/{auction_id}/reviews", response_model=list[AuctionReviewRead])
def list_auction_reviews(
    auction_id: int,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> list[AuctionReviewRead]:
    auction = get_auction_or_404(db, auction_id)
    require_can_view_auction(auction, current_user)
    statement = select(AuctionReview).where(AuctionReview.auction_id == auction.id).order_by(AuctionReview.created_at.desc(), AuctionReview.id.desc())
    return [AuctionReviewRead.model_validate(review) for review in db.scalars(statement).all()]


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
