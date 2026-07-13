from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.auction import Auction, AuctionReview
from app.models.user import SellerFollow, User
from app.schemas.user import FollowedSellerRead, FollowRequest

router = APIRouter(prefix="/api/follow", tags=["follow"])


def _seller_or_404(db: Session, username: str) -> User:
    seller = db.scalar(select(User).where(User.username == username, User.deleted_at.is_(None), User.is_active.is_(True)))
    if seller is None:
        raise HTTPException(status_code=404, detail="Elado nem talalhato.")
    return seller


def _followed_seller_read(db: Session, follow: SellerFollow) -> FollowedSellerRead:
    active_count = int(db.scalar(select(func.count()).select_from(Auction).where(Auction.seller_id == follow.seller_id, Auction.deleted_at.is_(None), Auction.status.in_({"scheduled", "active"}))) or 0)
    average_rating = db.scalar(select(func.avg(AuctionReview.rating)).where(AuctionReview.reviewed_user_id == follow.seller_id))
    return FollowedSellerRead(
        username=follow.seller.username,
        full_name=follow.seller.full_name,
        followed_at=follow.created_at,
        active_auctions=active_count,
        average_rating=round(float(average_rating), 2) if average_rating is not None else None,
    )


@router.post("", response_model=FollowedSellerRead, status_code=status.HTTP_201_CREATED)
def follow_seller(payload: FollowRequest, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> FollowedSellerRead:
    seller = _seller_or_404(db, payload.username)
    if seller.id == current_user.id:
        raise HTTPException(status_code=409, detail="Sajat profilt nem lehet kovetni.")
    existing = db.scalar(select(SellerFollow).where(SellerFollow.follower_id == current_user.id, SellerFollow.seller_id == seller.id))
    if existing is not None:
        return _followed_seller_read(db, existing)
    follow = SellerFollow(follower_id=current_user.id, seller_id=seller.id)
    db.add(follow)
    db.commit()
    db.refresh(follow)
    return _followed_seller_read(db, follow)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_seller(payload: FollowRequest, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> None:
    seller = _seller_or_404(db, payload.username)
    follow = db.scalar(select(SellerFollow).where(SellerFollow.follower_id == current_user.id, SellerFollow.seller_id == seller.id))
    if follow is None:
        raise HTTPException(status_code=404, detail="A kovetes nem talalhato.")
    db.delete(follow)
    db.commit()


@router.get("ing", response_model=list[FollowedSellerRead])
def list_following(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[FollowedSellerRead]:
    follows = db.scalars(select(SellerFollow).where(SellerFollow.follower_id == current_user.id).order_by(SellerFollow.created_at.desc(), SellerFollow.id.desc())).all()
    return [_followed_seller_read(db, follow) for follow in follows]
