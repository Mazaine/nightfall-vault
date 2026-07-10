from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.project_name}
