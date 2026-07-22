import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import redis
import redis.asyncio as async_redis

from app.core.config import settings

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@lru_cache(maxsize=1)
def redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=2, socket_timeout=2)


def publish_event(stream: str, event_type: str, payload: dict[str, Any]) -> str | None:
    try:
        return str(redis_client().xadd(stream, {"event": event_type, "data": json.dumps(payload, ensure_ascii=False, default=str)}, maxlen=settings.realtime_stream_max_length, approximate=True))
    except Exception:
        logger.exception("Realtime event publish failed: stream=%s event=%s", stream, event_type)
        return None


def publish_user_event(user_id: int, event_type: str, payload: dict[str, Any]) -> str | None:
    return publish_event(f"nightfall:realtime:user:{user_id}", event_type, payload)


def publish_auction_event(auction_id: int, event_type: str, payload: dict[str, Any]) -> str | None:
    event_id = publish_event(f"nightfall:realtime:auction:{auction_id}", event_type, payload)
    publish_event("nightfall:realtime:auctions", event_type, payload)
    return event_id


async def iter_stream(stream: str, last_event_id: str = "$", block_ms: int = 15000) -> AsyncIterator[tuple[str, str, dict[str, Any]]]:
    client = async_redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=2, socket_timeout=20)
    cursor = last_event_id or "$"
    try:
        while True:
            result = await client.xread({stream: cursor}, block=block_ms, count=100)
            if not result:
                yield cursor, "heartbeat", {"at": now_iso()}
                continue
            for _, entries in result:
                for event_id, fields in entries:
                    cursor = event_id
                    try:
                        payload = json.loads(fields.get("data", "{}"))
                    except json.JSONDecodeError:
                        payload = {}
                    yield event_id, fields.get("event", "message"), payload
    finally:
        await client.aclose()


def set_presence(user_id: int) -> dict[str, Any]:
    seen_at = now_iso()
    client = redis_client()
    client.setex(f"nightfall:presence:online:{user_id}", 45, seen_at)
    client.set(f"nightfall:presence:last:{user_id}", seen_at)
    return {"user_id": user_id, "online": True, "last_active_at": seen_at}


def get_presence(user_id: int) -> dict[str, Any]:
    client = redis_client()
    online_value = client.get(f"nightfall:presence:online:{user_id}")
    last_seen = online_value or client.get(f"nightfall:presence:last:{user_id}")
    return {"user_id": user_id, "online": online_value is not None, "last_active_at": last_seen}
