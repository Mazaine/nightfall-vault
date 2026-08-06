from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.user import User
from app.schemas.demo_auction import DemoAuctionCleanupPreview, DemoAuctionCleanupPreviewRequest, DemoAuctionCleanupRequest, DemoAuctionCounts, DemoAuctionMutation, DemoAuctionOperationResult, DemoAuctionPreview, DemoAuctionStatus
from app.services.demo_auctions import DemoAuctionService


router = APIRouter(prefix="/api/admin/demo-auctions", tags=["admin-demo-auctions"])


def _limit(request: Request, admin: User) -> None:
    check_rate_limit(request, "admin:demo-auctions", limit=10, identifier=str(admin.id))


@router.get("/status", response_model=DemoAuctionStatus)
def status(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _limit(request, admin)
    return DemoAuctionService(db).status()


@router.post("/preview", response_model=DemoAuctionPreview)
def preview(payload: DemoAuctionCounts, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _limit(request, admin)
    return DemoAuctionService(db).preview(payload.regular_count, payload.featured_count)


@router.post("/create", response_model=DemoAuctionOperationResult)
def create(payload: DemoAuctionMutation, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _limit(request, admin)
    return DemoAuctionService(db).create(payload.regular_count, payload.featured_count, admin, payload.confirmation)


@router.post("/reset", response_model=DemoAuctionOperationResult)
def reset(payload: DemoAuctionMutation, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _limit(request, admin)
    return DemoAuctionService(db).reset(payload.regular_count, payload.featured_count, admin, payload.confirmation)


@router.post("/cleanup-preview", response_model=DemoAuctionCleanupPreview)
def cleanup_preview(payload: DemoAuctionCleanupPreviewRequest, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _limit(request, admin)
    return DemoAuctionService(db).cleanup_preview(payload.batch_key)


@router.delete("", response_model=DemoAuctionOperationResult)
def cleanup(payload: DemoAuctionCleanupRequest, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _limit(request, admin)
    return DemoAuctionService(db).cleanup(admin, payload.confirmation, payload.batch_key)
