from time import monotonic
import logging

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse, PlainTextResponse
from redis import Redis
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.services.scheduler_health import read_scheduler_heartbeat
from app.storage import storage

router = APIRouter(tags=["health"])
PROCESS_STARTED_AT = monotonic()
logger = logging.getLogger(__name__)


@router.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
def ready():
    checks: dict[str, str] = {}
    http_status = status.HTTP_200_OK
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            revision = connection.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar()
        checks["postgres"] = "ok"
        checks["alembic"] = "ok" if revision else "unknown"
    except Exception:
        checks["postgres"] = "error"
        checks["alembic"] = "error"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    redis_client = Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1)
    try:
        redis_client.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    if settings.auction_scheduler_mode.lower() == "external":
        try:
            checks["scheduler"] = "ok" if read_scheduler_heartbeat() is not None else "error"
        except Exception:
            checks["scheduler"] = "error"
        if checks["scheduler"] != "ok":
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    try:
        storage_health = storage.check_health()
        checks["storage"] = "ok" if storage_health.healthy else "error"
        if not storage_health.healthy:
            logger.error("Media storage readiness failed: readable=%s writable=%s", storage_health.readable, storage_health.writable)
    except Exception:
        logger.exception("Media storage readiness check failed")
        checks["storage"] = "error"
    if checks["storage"] != "ok":
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=http_status, content={"status": "ok" if http_status == 200 else "degraded", "checks": checks})


@router.get("/health")
@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.project_name}


@router.get("/health/metrics", response_class=PlainTextResponse)
def metrics() -> str:
    try:
        heartbeat = read_scheduler_heartbeat()
    except Exception:
        heartbeat = None
    heartbeat_up = 1 if heartbeat is not None else 0
    leader = 1 if heartbeat and heartbeat.get("leader") else 0
    closed_count = int(heartbeat.get("closed_count", 0)) if heartbeat else 0
    uptime_seconds = max(0, int(monotonic() - PROCESS_STARTED_AT))
    return "\n".join(
        [
            "# HELP nightfall_process_up Whether the API process is running.",
            "# TYPE nightfall_process_up gauge",
            "nightfall_process_up 1",
            "# HELP nightfall_process_uptime_seconds API process uptime.",
            "# TYPE nightfall_process_uptime_seconds gauge",
            f"nightfall_process_uptime_seconds {uptime_seconds}",
            "# HELP nightfall_scheduler_heartbeat_up Whether a scheduler heartbeat is present.",
            "# TYPE nightfall_scheduler_heartbeat_up gauge",
            f"nightfall_scheduler_heartbeat_up {heartbeat_up}",
            "# HELP nightfall_scheduler_leader Whether the last worker iteration held the leader lock.",
            "# TYPE nightfall_scheduler_leader gauge",
            f"nightfall_scheduler_leader {leader}",
            "# HELP nightfall_scheduler_last_closed_auctions Auctions closed in the last iteration.",
            "# TYPE nightfall_scheduler_last_closed_auctions gauge",
            f"nightfall_scheduler_last_closed_auctions {closed_count}",
            "",
        ]
    )
