from pathlib import Path

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from redis import Redis
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine

router = APIRouter(tags=["health"])


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
    try:
        Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1).ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    checks["storage"] = "ok" if Path(settings.storage_upload_dir).exists() else "error"
    if checks["storage"] != "ok":
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=http_status, content={"status": "ok" if http_status == 200 else "degraded", "checks": checks})


@router.get("/health")
@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.project_name}
