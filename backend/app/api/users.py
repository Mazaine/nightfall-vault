from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.dependencies.auth import get_optional_current_user
from app.models.auction import Auction, AuctionReview, Bid
from app.models.transaction import AuctionTransaction
from app.models.user import SellerFollow, User
from app.schemas.user import PublicAuctionSummary, PublicBusinessHistoryPage, PublicBusinessHistoryRead, PublicReviewPage, PublicReviewRead, PublicUserProfile, PublicUserStats
from app.services.user_blocks import is_blocked_by
from app.services.membership import featured_auction_order
from app.services.demo_visibility import auction_visibility_clause, can_access_demo_auctions
from app.storage.paths import media_url

router = APIRouter(prefix="/api/users", tags=["users"])
ACTIVE_STATUSES = {"scheduled", "active"}
CLOSED_STATUSES = {"sold", "unsold"}
REVIEW_SORTS = {"newest", "oldest", "rating_high", "rating_low"}


def _public_user_or_404(db: Session, username: str) -> User:
    user = db.scalar(select(User).where(User.username == username, User.deleted_at.is_(None), User.is_active.is_(True)))
    if user is None:
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")
    return user


def _auction_summary(db: Session, auction: Auction) -> PublicAuctionSummary:
    bid_count = int(db.scalar(select(func.count()).select_from(Bid).where(Bid.auction_id == auction.id, Bid.status == "active")) or 0)
    return PublicAuctionSummary(
        id=auction.id,
        title=auction.title,
        category=auction.category,
        condition=auction.condition,
        status=auction.status,
        current_price=str(auction.current_price),
        buy_now_enabled=auction.buy_now_enabled,
        buy_now_price=str(auction.buy_now_price) if auction.buy_now_price is not None else None,
        ends_at=auction.ends_at,
        bid_count=bid_count,
    )


def _review_read(review: AuctionReview) -> PublicReviewRead:
    return PublicReviewRead(
        id=review.id,
        auction_id=review.auction_id,
        auction_title=review.auction.title if review.auction else "Aukció",
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


def _review_query(db: Session, user_id: int, current_user: User | None = None):
    return (
        db.query(AuctionReview)
        .join(Auction, Auction.id == AuctionReview.auction_id)
        .options(joinedload(AuctionReview.auction))
        .filter(
            AuctionReview.reviewed_user_id == user_id,
            Auction.deleted_at.is_(None),
            auction_visibility_clause(current_user),
        )
    )


def _apply_review_sort(query, sort: str):
    if sort == "oldest":
        return query.order_by(AuctionReview.created_at.asc(), AuctionReview.id.asc())
    if sort == "rating_high":
        return query.order_by(AuctionReview.rating.desc(), AuctionReview.created_at.desc(), AuctionReview.id.desc())
    if sort == "rating_low":
        return query.order_by(AuctionReview.rating.asc(), AuctionReview.created_at.desc(), AuctionReview.id.desc())
    return query.order_by(AuctionReview.created_at.desc(), AuctionReview.id.desc())


def build_public_profile(db: Session, user: User, current_user: User | None = None) -> PublicUserProfile:
    ratings = db.query(
        func.count(AuctionReview.id),
        func.avg(AuctionReview.rating),
        func.sum(case((AuctionReview.rating >= 4, 1), else_=0)),
        func.sum(case((AuctionReview.rating <= 2, 1), else_=0)),
    ).filter(AuctionReview.reviewed_user_id == user.id).one()
    review_count, average_rating, positive_reviews, negative_reviews = ratings
    visibility = auction_visibility_clause(current_user)
    active_count = int(db.scalar(select(func.count()).select_from(Auction).where(Auction.seller_id == user.id, Auction.deleted_at.is_(None), Auction.status.in_(ACTIVE_STATUSES), visibility)) or 0)
    closed_count = int(db.scalar(select(func.count()).select_from(Auction).where(Auction.seller_id == user.id, Auction.deleted_at.is_(None), Auction.status.in_(CLOSED_STATUSES), visibility)) or 0)
    sold_count = int(db.scalar(select(func.count()).select_from(Auction).where(Auction.seller_id == user.id, Auction.deleted_at.is_(None), Auction.status == "sold", visibility)) or 0)
    successful_sales = int(db.scalar(select(func.count()).select_from(AuctionTransaction).join(Auction, Auction.id == AuctionTransaction.auction_id).where(
        AuctionTransaction.seller_id == user.id,
        AuctionTransaction.status.in_(["completed", "reviewed", "archived"]),
        Auction.deleted_at.is_(None),
        visibility,
    )) or 0)
    won_count = int(db.scalar(select(func.count()).select_from(Auction).where(Auction.winner_id == user.id, Auction.status == "sold", Auction.deleted_at.is_(None), visibility)) or 0)
    total_bids = int(db.scalar(select(func.count()).select_from(Bid).where(Bid.bidder_id == user.id)) or 0)
    participated_auctions = select(Bid.auction_id).where(Bid.bidder_id == user.id, Bid.status == "active").distinct().subquery()
    lost_count = int(db.scalar(select(func.count()).select_from(Auction).where(Auction.id.in_(select(participated_auctions.c.auction_id)), Auction.status == "sold", Auction.winner_id != user.id, Auction.deleted_at.is_(None))) or 0)
    completed_bid_auctions = won_count + lost_count
    follower_count = int(db.scalar(select(func.count()).select_from(SellerFollow).where(SellerFollow.seller_id == user.id)) or 0)
    following_count = int(db.scalar(select(func.count()).select_from(SellerFollow).where(SellerFollow.follower_id == user.id)) or 0)

    active_auctions = db.scalars(select(Auction).where(Auction.seller_id == user.id, Auction.deleted_at.is_(None), Auction.status.in_(ACTIVE_STATUSES), visibility).order_by(featured_auction_order(), Auction.ends_at.asc(), Auction.id.asc()).limit(12)).all()
    closed_auctions = db.scalars(select(Auction).where(Auction.seller_id == user.id, Auction.deleted_at.is_(None), Auction.status.in_(CLOSED_STATUSES), visibility).order_by(featured_auction_order(), Auction.ends_at.desc(), Auction.id.desc()).limit(12)).all()
    recent_reviews = _apply_review_sort(_review_query(db, user.id, current_user), "newest").limit(5).all()
    is_followed = False
    is_blocked = False
    is_blocked_by_user = False
    if current_user is not None:
        is_followed = db.scalar(select(SellerFollow.id).where(SellerFollow.follower_id == current_user.id, SellerFollow.seller_id == user.id)) is not None
        is_blocked = is_blocked_by(db, current_user.id, user.id)
        is_blocked_by_user = is_blocked_by(db, user.id, current_user.id)

    return PublicUserProfile(
        username=user.username,
        full_name=user.full_name,
        created_at=user.created_at,
        stats=PublicUserStats(
            review_count=int(review_count or 0),
            positive_reviews=int(positive_reviews or 0),
            negative_reviews=int(negative_reviews or 0),
            average_rating=round(float(average_rating), 2) if average_rating is not None else None,
            active_auctions=active_count,
            closed_auctions=closed_count,
            successful_sales=successful_sales,
            sold_auctions=sold_count,
            won_auctions=won_count,
            total_bids=total_bids,
            successful_bids=won_count,
            lost_bids=lost_count,
            success_rate=round(won_count * 100 / completed_bid_auctions, 2) if completed_bid_auctions else 0.0,
            follower_count=follower_count,
            following_count=following_count,
        ),
        active_auctions=[_auction_summary(db, auction) for auction in active_auctions],
        closed_auctions=[_auction_summary(db, auction) for auction in closed_auctions],
        recent_reviews=[_review_read(review) for review in recent_reviews],
        is_followed=is_followed,
        is_blocked=is_blocked,
        is_blocked_by_user=is_blocked_by_user,
    )


@router.get("/{username}", response_model=PublicUserProfile)
def get_public_user_profile(username: str, current_user: User | None = Depends(get_optional_current_user), db: Session = Depends(get_db)) -> PublicUserProfile:
    user = _public_user_or_404(db, username)
    if user.demo_batch_id is not None and not can_access_demo_auctions(current_user):
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")
    return build_public_profile(db, user, current_user)


@router.get("/{username}/reviews", response_model=PublicReviewPage)
def list_public_user_reviews(
    username: str,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="newest"),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> PublicReviewPage:
    if sort not in REVIEW_SORTS:
        raise HTTPException(status_code=422, detail="Érvénytelen rendezés.")
    user = _public_user_or_404(db, username)
    if user.demo_batch_id is not None and not can_access_demo_auctions(current_user):
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")
    query = _review_query(db, user.id, current_user)
    total = query.count()
    reviews = _apply_review_sort(query, sort).offset(offset).limit(limit).all()
    return PublicReviewPage(items=[_review_read(review) for review in reviews], total=total, limit=limit, offset=offset)


@router.get("/{username}/business-history", response_model=PublicBusinessHistoryPage)
def list_public_business_history(
    username: str,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> PublicBusinessHistoryPage:
    user = _public_user_or_404(db, username)
    if user.demo_batch_id is not None and not can_access_demo_auctions(current_user):
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")

    base = (
        db.query(Auction, AuctionTransaction)
        .join(AuctionTransaction, AuctionTransaction.auction_id == Auction.id)
        .options(joinedload(Auction.images))
        .filter(
            Auction.seller_id == user.id,
            Auction.status == "sold",
            Auction.deleted_at.is_(None),
            auction_visibility_clause(current_user),
        )
    )
    total = base.count()
    rows = base.order_by(Auction.finalized_at.desc(), Auction.id.desc()).offset(offset).limit(limit).all()
    items: list[PublicBusinessHistoryRead] = []
    for auction, transaction in rows:
        cover = next((image for image in auction.images if image.is_cover), auction.images[0] if auction.images else None)
        rating = db.scalar(select(AuctionReview.rating).where(
            AuctionReview.auction_id == auction.id,
            AuctionReview.reviewed_user_id == user.id,
        ).order_by(AuctionReview.id.desc()).limit(1))
        items.append(PublicBusinessHistoryRead(
            auction_id=auction.id,
            auction_title=auction.title,
            image_url=media_url((cover.list_storage_key or cover.thumbnail_storage_key or cover.storage_key) if cover else None),
            closed_at=auction.finalized_at or auction.ends_at,
            final_price=str(auction.current_price),
            public_status="sikeresen_lezárt" if transaction.status in {"completed", "reviewed", "archived"} else "lezárás_folyamatban",
            rating=rating,
        ))
    return PublicBusinessHistoryPage(items=items, total=total, limit=limit, offset=offset)
