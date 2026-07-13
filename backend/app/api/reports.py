from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.moderation import Report
from app.models.user import User
from app.schemas.moderation import ReportCreate, ReportPage, ReportRead
from app.services.reports import create_auction_report, create_user_report, get_report_or_404, report_options
from app.services.user_blocks import get_active_user_by_username

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _report_read(report: Report) -> ReportRead:
    return ReportRead.model_validate(report)


@router.post("/auctions/{auction_id}", response_model=ReportRead, status_code=201)
def report_auction(
    auction_id: int,
    payload: ReportCreate,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> ReportRead:
    check_rate_limit(request, "report-create", limit=10, identifier=str(current_user.id))
    report = create_auction_report(db, current_user, auction_id, payload.reason, payload.details)
    return _report_read(report)


@router.post("/users/{username}", response_model=ReportRead, status_code=201)
def report_user(
    username: str,
    payload: ReportCreate,
    request: Request,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> ReportRead:
    check_rate_limit(request, "report-create", limit=10, identifier=str(current_user.id))
    reported_user = get_active_user_by_username(db, username)
    report = create_user_report(db, current_user, reported_user, payload.reason, payload.details)
    return _report_read(report)


@router.get("/me", response_model=ReportPage)
def list_my_reports(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> ReportPage:
    query = db.query(Report).options(*report_options()).filter(Report.reporter_id == current_user.id)
    total = query.count()
    reports = query.order_by(Report.created_at.desc(), Report.id.desc()).offset(offset).limit(limit).all()
    return ReportPage(items=[_report_read(report) for report in reports], total=total, limit=limit, offset=offset)


@router.get("/me/{report_id}", response_model=ReportRead)
def get_my_report(report_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> ReportRead:
    report = get_report_or_404(db, report_id)
    if report.reporter_id != current_user.id:
        raise HTTPException(status_code=404, detail="Jelent?s nem tal?lhat?.")
    return _report_read(report)
