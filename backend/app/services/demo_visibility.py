from fastapi import HTTPException

from app.models.auction import Auction
from app.models.user import User


DEMO_ROLES = {"tester", "admin"}


def can_access_demo_auctions(user: User | None) -> bool:
    return user is not None and user.role in DEMO_ROLES


def auction_visibility_clause(user: User | None):
    shop_clause = Auction.deleted_at.is_(None) if user is not None and user.role == "admin" else Auction.shop_source.is_(None)
    if can_access_demo_auctions(user):
        return Auction.deleted_at.is_(None) & shop_clause
    return Auction.demo_batch_id.is_(None) & shop_clause


def require_demo_auction_access(auction: Auction, user: User | None) -> None:
    if auction.shop_source and (user is None or user.role != "admin"):
        raise HTTPException(status_code=404, detail="A hirdetés nem található.")
    if auction.demo_batch_id is not None and not can_access_demo_auctions(user):
        raise HTTPException(status_code=404, detail="Az aukció nem található.")
