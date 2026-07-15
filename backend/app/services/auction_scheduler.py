import asyncio
import contextlib
import logging
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.core.config import settings
from app.models.auction import Auction
from app.services.auction_lifecycle import close_ended_active_auction, now_utc
from app.services.scheduler_health import write_scheduler_heartbeat

logger = logging.getLogger(__name__)
SCHEDULER_INTERVAL_SECONDS = 10


@dataclass(frozen=True)
class SchedulerIterationResult:
    leader: bool
    closed_count: int


def close_expired_auctions(db: Session, limit: int = 50) -> int:
    from app.services.transactions import archive_due_transactions

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
    archive_due_transactions(db)
    db.commit()
    return closed_count


def run_scheduler_iteration(db: Session) -> SchedulerIterationResult:
    is_leader = bool(
        db.scalar(
            text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
            {"lock_key": settings.auction_scheduler_lock_key},
        )
    )
    if not is_leader:
        db.rollback()
        return SchedulerIterationResult(leader=False, closed_count=0)
    return SchedulerIterationResult(leader=True, closed_count=close_expired_auctions(db))


async def scheduler_loop(stop_event: asyncio.Event, interval_seconds: int | None = None) -> None:
    interval = interval_seconds or settings.auction_scheduler_interval_seconds
    while not stop_event.is_set():
        db = SessionLocal()
        try:
            result = run_scheduler_iteration(db)
            write_scheduler_heartbeat(leader=result.leader, closed_count=result.closed_count)
            if result.closed_count:
                logger.info("Auction scheduler closed %s expired auctions.", result.closed_count)
        except Exception:
            db.rollback()
            logger.exception("Auction scheduler iteration failed.")
        finally:
            db.close()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
