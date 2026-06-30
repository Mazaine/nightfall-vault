import pytest
from fastapi import HTTPException

from app.core.rate_limit import InMemoryRateLimiter, RedisRateLimiter


class FakeRedisClient:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}
        self.expirations: dict[str, int] = {}

    def incr(self, key: str) -> int:
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    def expire(self, key: str, seconds: int) -> None:
        self.expirations[key] = seconds


def test_memory_rate_limiter_blocks_after_limit() -> None:
    limiter = InMemoryRateLimiter()

    limiter.check("auth:login:test", limit=2)
    limiter.check("auth:login:test", limit=2)

    with pytest.raises(HTTPException) as exc_info:
        limiter.check("auth:login:test", limit=2)

    assert exc_info.value.status_code == 429
    assert "Túl sok próbálkozás" in exc_info.value.detail


def test_redis_rate_limiter_uses_redis_counter() -> None:
    fake_redis = FakeRedisClient()
    limiter = RedisRateLimiter("redis://redis:6379/0", redis_client=fake_redis)

    limiter.check("auth:login:redis-test", limit=2, window_seconds=60)
    limiter.check("auth:login:redis-test", limit=2, window_seconds=60)

    with pytest.raises(HTTPException) as exc_info:
        limiter.check("auth:login:redis-test", limit=2, window_seconds=60)

    key = "rate-limit:auth:login:redis-test"
    assert fake_redis.values[key] == 3
    assert fake_redis.expirations[key] == 60
    assert exc_info.value.status_code == 429
