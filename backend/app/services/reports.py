from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, joinedload

from app.models.auction import Auction
from app.models.moderation import Report
from app.models.notification import Notification
from app.models.user import User
from app.schemas.moderation import AUCTION_REPORT_REASONS, USER_REPORT_REASONS
from app.services.auction_lifecycle import can_view_auction, sync_auction_status
from app.services.notifications import create_notification
from app.services.security_audit import create_domain_audit_log

OPEN_REPORT_STATUSES = {"open", "under_review"}
ALLOWED_STATUS_TRANSITIONS = {
    "open": {"under_review", "resolved", "dismissed"},
    "under_review": {"resolved", "dismissed"},
    "resolved": set(),
    "dismissed": set(),
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def report_options():
    return (
        joinedload(Report.reporter),
        joinedload(Report.reported_user),
        joinedload(Report.assigned_admin),
        joinedload(Report.auction),
    )


def get_report_or_404(db: Session, report_id: int) -> Report:
    report = db.scalar(select(Report).options(*report_options()).where(Report.id == report_id))
    if report is None:
        raise HTTPException(status_code=404, detail="Jelent?s nem tal?lhat?.")
    return report


def ensure_reason(target_type: str, reason: str) -> None:
    allowed = AUCTION_REPORT_REASONS if target_type == "auction" else USER_REPORT_REASONS
    if reason not in allowed:
        raise HTTPException(status_code=422, detail="?rv?nytelen jelent?si ok.")


def ensure_no_open_duplicate(db: Session, reporter_id: int, target_type: str, auction_id: int | None, reported_user_id: int | None) -> None:
    query = select(Report.id).where(Report.reporter_id == reporter_id, Report.target_type == target_type, Report.status.in_(OPEN_REPORT_STATUSES))
    if target_type == "auction":
        query = query.where(Report.auction_id == auction_id)
    else:
        query = query.where(Report.reported_user_id == reported_user_id)
    if db.scalar(query) is not None:
        raise HTTPException(status_code=409, detail="Erre a c?lra m?r van nyitott jelent?sed.")


def create_auction_report(db: Session, reporter: User, auction_id: int, reason: str, details: str | None) -> Report:
    ensure_reason("auction", reason)
    auction = db.get(Auction, auction_id)
    if auction is None or auction.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Aukci? nem tal?lhat?.")
    auction = sync_auction_status(db, auction)
    if not can_view_auction(auction, reporter):
        raise HTTPException(status_code=404, detail="Aukci? nem tal?lhat?.")
    if auction.seller_id == reporter.id:
        raise HTTPException(status_code=409, detail="Saj?t aukci?t nem lehet jelenteni.")
    ensure_no_open_duplicate(db, reporter.id, "auction", auction.id, auction.seller_id)
    report = Report(reporter_id=reporter.id, target_type="auction", auction_id=auction.id, reported_user_id=auction.seller_id, reason=reason, details=details, status="open", priority="normal")
    db.add(report)
    db.flush()
    create_domain_audit_log(db, action="report_created", user_id=reporter.id, auction_id=auction.id, metadata={"report_id": report.id, "target_type": "auction", "reason": reason})
    db.commit()
    db.refresh(report)
    return get_report_or_404(db, report.id)


def create_user_report(db: Session, reporter: User, reported_user: User, reason: str, details: str | None) -> Report:
    ensure_reason("user", reason)
    if reporter.id == reported_user.id:
        raise HTTPException(status_code=409, detail="Saj?t profilt nem lehet jelenteni.")
    if reported_user.deleted_at is not None or not reported_user.is_active:
        raise HTTPException(status_code=404, detail="Felhaszn?l? nem tal?lhat?.")
    ensure_no_open_duplicate(db, reporter.id, "user", None, reported_user.id)
    report = Report(reporter_id=reporter.id, target_type="user", reported_user_id=reported_user.id, reason=reason, details=details, status="open", priority="normal")
    db.add(report)
    db.flush()
    create_domain_audit_log(db, action="report_created", user_id=reporter.id, metadata={"report_id": report.id, "target_type": "user", "reason": reason, "reported_user_id": reported_user.id})
    db.commit()
    db.refresh(report)
    return get_report_or_404(db, report.id)


def update_report_status(db: Session, report: Report, admin: User, next_status: str, public_resolution: str | None) -> Report:
    if next_status not in ALLOWED_STATUS_TRANSITIONS.get(report.status, set()):
        raise HTTPException(status_code=409, detail="Tiltott jelent?s st?tuszv?lt?s.")
    previous = report.status
    report.status = next_status
    report.assigned_admin_id = admin.id
    if public_resolution is not None:
        report.public_resolution = public_resolution
    if next_status in {"resolved", "dismissed"}:
        report.closed_at = now_utc()
        notification_type = "report_resolved" if next_status == "resolved" else "report_dismissed"
        create_notification(
            db,
            user_id=report.reporter_id,
            auction_id=report.auction_id,
            notification_type=notification_type,
            title="Jelent?s lez?rva" if next_status == "resolved" else "Jelent?s elutas?tva",
            message="A bek?ld?tt jelent?sed st?tusza friss?lt.",
        )
    db.add(report)
    create_domain_audit_log(db, action="report_status_changed", user_id=admin.id, auction_id=report.auction_id, metadata={"report_id": report.id, "from": previous, "to": next_status})
    db.commit()
    db.refresh(report)
    return get_report_or_404(db, report.id)


def update_report_priority(db: Session, report: Report, admin: User, priority: str) -> Report:
    previous = report.priority
    report.priority = priority
    report.assigned_admin_id = admin.id
    db.add(report)
    create_domain_audit_log(db, action="report_priority_changed", user_id=admin.id, auction_id=report.auction_id, metadata={"report_id": report.id, "from": previous, "to": priority})
    db.commit()
    db.refresh(report)
    return get_report_or_404(db, report.id)


def update_report_note(db: Session, report: Report, admin: User, admin_note: str | None) -> Report:
    report.admin_note = admin_note
    report.assigned_admin_id = admin.id
    db.add(report)
    create_domain_audit_log(db, action="report_note_changed", user_id=admin.id, auction_id=report.auction_id, metadata={"report_id": report.id, "note_present": bool(admin_note)})
    db.commit()
    db.refresh(report)
    return get_report_or_404(db, report.id)


def related_report_counts(db: Session, report: Report) -> tuple[int, int]:
    query = select(func.count()).select_from(Report).where(Report.target_type == report.target_type)
    if report.target_type == "auction":
        query = query.where(Report.auction_id == report.auction_id)
    else:
        query = query.where(Report.reported_user_id == report.reported_user_id)
    total = int(db.scalar(query) or 0)
    open_total = int(db.scalar(query.where(Report.status.in_(OPEN_REPORT_STATUSES))) or 0)
    return open_total, total
