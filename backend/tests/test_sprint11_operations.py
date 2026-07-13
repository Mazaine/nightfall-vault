from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.auction_scheduler import run_scheduler_iteration
from app.services.scheduler_health import read_scheduler_heartbeat, write_scheduler_heartbeat


def test_scheduler_iteration_skips_when_leader_lock_is_held() -> None:
    leader_db = SessionLocal()
    follower_db = SessionLocal()
    try:
        acquired = leader_db.scalar(
            text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
            {"lock_key": settings.auction_scheduler_lock_key},
        )
        assert acquired is True

        result = run_scheduler_iteration(follower_db)

        assert result.leader is False
        assert result.closed_count == 0
    finally:
        follower_db.rollback()
        follower_db.close()
        leader_db.rollback()
        leader_db.close()


def test_scheduler_heartbeat_round_trip() -> None:
    write_scheduler_heartbeat(leader=True, closed_count=3)

    heartbeat = read_scheduler_heartbeat()

    assert heartbeat is not None
    assert heartbeat["leader"] is True
    assert heartbeat["closed_count"] == 3
    assert "timestamp" in heartbeat
