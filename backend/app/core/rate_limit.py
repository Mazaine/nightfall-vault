import logging
import ipaddress
from collections import defaultdict, deque
from typing import Protocol
from time import monotonic

from fastapi import HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger(__name__)

RATE_LIMIT_MESSAGE = "Túl sok próbálkozás. Kérlek várj egy kicsit, majd próbáld újra."


class RateLimiterBackend(Protocol):
    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        ...


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        now = monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()

        if len(hits) >= limit:
            raise_rate_limit_exceeded()

        hits.append(now)


class RedisRateLimiter:
    def __init__(
        self,
        redis_url: str,
        redis_client: object | None = None,
        fallback_limiter: InMemoryRateLimiter | None = None,
    ) -> None:
        self.redis_url = redis_url
        self._client = redis_client
        self._fallback_limiter = fallback_limiter or InMemoryRateLimiter()

    @property
    def client(self):
        if self._client is None:
            try:
                import redis
            except ImportError as exc:
                self._handle_redis_error(exc, "A Redis Python kliens nincs telepítve.")
                return None

            self._client = redis.Redis.from_url(
                self.redis_url,
                socket_connect_timeout=2,
                socket_timeout=2,
                decode_responses=True,
            )

        return self._client

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        namespaced_key = f"rate-limit:{key}"
        client = self.client
        if client is None:
            self._fallback_limiter.check(key, limit, window_seconds)
            return

        try:
            current_count = int(client.incr(namespaced_key))
            if current_count == 1:
                client.expire(namespaced_key, window_seconds)
        except Exception as exc:
            self._handle_redis_error(exc, "A Redis rate limiter nem elérhető.")
            self._fallback_limiter.check(key, limit, window_seconds)
            return

        if current_count > limit:
            raise_rate_limit_exceeded()

    def _handle_redis_error(self, exc: Exception, message: str) -> None:
        if settings.environment.lower() == "production":
            logger.exception("%s Production környezetben a kérés blokkolva.", message)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="A rate limit védelem átmenetileg nem elérhető.",
            ) from exc

        logger.warning("%s Development módban átmeneti memory fallback aktív.", message)


_rate_limiter: RateLimiterBackend | None = None


def raise_rate_limit_exceeded() -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=RATE_LIMIT_MESSAGE,
    )


def get_rate_limiter() -> RateLimiterBackend:
    global _rate_limiter
    if _rate_limiter is not None:
        return _rate_limiter

    backend = settings.rate_limit_backend.strip().lower()
    if backend == "redis":
        _rate_limiter = RedisRateLimiter(settings.redis_url)
        return _rate_limiter

    if backend != "memory":
        logger.warning("Ismeretlen RATE_LIMIT_BACKEND érték: %s. Memory backend lesz használva.", backend)

    _rate_limiter = InMemoryRateLimiter()
    return _rate_limiter


def reset_rate_limiter_for_tests() -> None:
    global _rate_limiter
    _rate_limiter = None


def get_client_ip(request: Request) -> str:
    remote_ip = request.client.host if request.client else "unknown"
    try:
        trusted_networks = [ipaddress.ip_network(value) for value in settings.trusted_proxy_cidrs]
        remote_is_trusted = any(ipaddress.ip_address(remote_ip) in network for network in trusted_networks)
    except ValueError:
        logger.error("Invalid trusted proxy configuration.")
        remote_is_trusted = False
        trusted_networks = []
    forwarded_for = request.headers.get("x-forwarded-for")
    if not forwarded_for or not remote_is_trusted:
        return remote_ip
    chain = [item.strip() for item in forwarded_for.split(",") if item.strip()] + [remote_ip]
    for candidate in reversed(chain):
        try:
            address = ipaddress.ip_address(candidate)
        except ValueError:
            continue
        if not any(address in network for network in trusted_networks):
            return candidate
    return remote_ip


def check_rate_limit(request: Request, scope: str, limit: int, identifier: str | None = None) -> None:
    client_ip = get_client_ip(request)
    normalized_identifier = identifier.strip().lower() if identifier else ""
    get_rate_limiter().check(f"{scope}:{client_ip}:{normalized_identifier}", limit=limit)
