from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.auction import Auction, Bid
from app.models.user import SavedSearch
from app.services.notifications import create_notification


def _contains(value: str, search: str | None) -> bool:
    return search is None or search.casefold() in value.casefold()


def auction_matches_saved_search(db: Session, auction: Auction, saved: SavedSearch) -> bool:
    seller_name = auction.seller.username if auction.seller is not None else ""
    combined = f"{auction.title} {auction.description} {seller_name}"
    bid_count = int(db.scalar(select(func.count()).select_from(Bid).where(Bid.auction_id == auction.id)) or 0)
    now = datetime.now(timezone.utc)
    checks = (
        _contains(combined, saved.query),
        _contains(auction.title, saved.title),
        _contains(auction.description, saved.description),
        _contains(seller_name, saved.seller),
        saved.category is None or auction.category == saved.category,
        saved.condition is None or auction.condition == saved.condition,
        saved.status is None or auction.status == saved.status,
        saved.min_price is None or Decimal(auction.current_price) >= Decimal(saved.min_price),
        saved.max_price is None or Decimal(auction.current_price) <= Decimal(saved.max_price),
        saved.min_bids is None or bid_count >= saved.min_bids,
        saved.max_bids is None or bid_count <= saved.max_bids,
        saved.buy_now is None or auction.buy_now_enabled is saved.buy_now,
        not saved.soon_ending or now <= auction.ends_at <= now + timedelta(hours=24),
        not saved.new_only or auction.created_at >= now - timedelta(days=7),
    )
    return all(checks)


def notify_saved_search_matches(db: Session, auction: Auction) -> None:
    searches = db.scalars(select(SavedSearch).where(SavedSearch.user_id != auction.seller_id)).all()
    for saved in searches:
        if auction_matches_saved_search(db, auction, saved):
            create_notification(
                db,
                user_id=saved.user_id,
                auction_id=auction.id,
                notification_type="saved_search_match",
                title="Mentett kereses uj talalata",
                message=f"A(z) {saved.name} keresesedhez uj aukcio erkezett: {auction.title}",
                send_email=False,
            )
