from fastapi import HTTPException

from app.models.auction import Auction
from app.models.user import User


DEMO_ROLES = {"tester", "admin"}


def can_access_demo_auctions(user: User | None) -> bool:
    return user is not None and user.role in DEMO_ROLES


def auction_visibility_clause(user: User | None):
    if can_access_demo_auctions(user):
        return Auction.deleted_at.is_(None)
    return Auction.demo_batch_id.is_(None)


def require_demo_auction_access(auction: Auction, user: User | None) -> None:
    if auction.demo_batch_id is not None and not can_access_demo_auctions(user):
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
