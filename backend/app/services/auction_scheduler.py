import asyncio
import contextlib
import logging
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.core.config import settings
from app.models.auction import Auction
from app.models.notification import WatchlistReminder
from app.services.auction_lifecycle import close_ended_active_auction, now_utc
from app.services.notification_dispatcher import dispatch_notification
from app.services.scheduler_health import write_scheduler_heartbeat

logger = logging.getLogger(__name__)
SCHEDULER_INTERVAL_SECONDS = 10


@dataclass(frozen=True)
class SchedulerIterationResult:
    leader: bool
    closed_count: int


def send_due_watchlist_reminders(db: Session, limit: int = 500) -> int:
    current_time = now_utc()
    statement = (
        select(WatchlistReminder, Auction)
        .join(Auction, Auction.id == WatchlistReminder.auction_id)
        .where(
            WatchlistReminder.sent_at.is_(None), Auction.status == "active",
            Auction.ends_at > current_time,
            Auction.ends_at <= current_time + timedelta(minutes=30),
        )
        .order_by(Auction.ends_at.asc(), WatchlistReminder.minutes_before.desc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    sent_count = 0
    for reminder, auction in db.execute(statement).all():
        due_at = auction.ends_at - timedelta(minutes=reminder.minutes_before)
        if reminder.created_at and reminder.created_at > due_at:
            reminder.sent_at = current_time
            db.add(reminder)
            continue
        if current_time < due_at:
            continue
        dispatch_notification(
            db, user_id=reminder.user_id, auction_id=auction.id, notification_type="watchlist_reminder",
            title="Hamarosan zárul egy figyelt aukció",
            message=f"A(z) „{auction.title}” aukció {reminder.minutes_before} percen belül zárul.",
            target_url=f"/auctions/{auction.id}", event_key=f"watchlist-reminder:{reminder.id}",
        )
        reminder.sent_at = current_time
        db.add(reminder)
        sent_count += 1
    return sent_count


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
        previous_status = auction.status
        close_ended_active_auction(db, auction)
        if previous_status == "active" and auction.status != "active":
            closed_count += 1
    archive_due_transactions(db)
    send_due_watchlist_reminders(db)
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
