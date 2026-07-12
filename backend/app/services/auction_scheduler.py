import asyncio
import contextlib
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.auction import Auction
from app.services.auction_lifecycle import close_ended_active_auction, now_utc

logger = logging.getLogger(__name__)
SCHEDULER_INTERVAL_SECONDS = 10


def close_expired_auctions(db: Session, limit: int = 50) -> int:
    statement = (
        select(Auction)
        .where(Auction.status == "active", Auction.ends_at <= now_utc())
        .order_by(Auction.ends_at.asc(), Auction.id.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    closed_count = 0
    for auction in db.scalars(statement).all():
        close_ended_active_auction(db, auction)
        closed_count += 1
    db.commit()
    return closed_count


async def scheduler_loop(stop_event: asyncio.Event, interval_seconds: int = SCHEDULER_INTERVAL_SECONDS) -> None:
    while not stop_event.is_set():
        db = SessionLocal()
        try:
            closed_count = close_expired_auctions(db)
            if closed_count:
                logger.info("Auction scheduler closed %s expired auctions.", closed_count)
        except Exception:
            db.rollback()
            logger.exception("Auction scheduler iteration failed.")
        finally:
            db.close()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
