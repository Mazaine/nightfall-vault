import json
import logging
from datetime import datetime, timezone

from redis import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)
SCHEDULER_HEARTBEAT_KEY = "nightfall-vault:scheduler:heartbeat"


def redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1)


def write_scheduler_heartbeat(*, leader: bool, closed_count: int) -> None:
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "leader": leader,
        "closed_count": closed_count,
    }
    try:
        redis_client().setex(
            SCHEDULER_HEARTBEAT_KEY,
            settings.auction_scheduler_heartbeat_ttl_seconds,
            json.dumps(payload),
        )
    except Exception:
        logger.exception("Auction scheduler heartbeat write failed.")


def read_scheduler_heartbeat() -> dict | None:
    raw = redis_client().get(SCHEDULER_HEARTBEAT_KEY)
    if raw is None:
        return None
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None
