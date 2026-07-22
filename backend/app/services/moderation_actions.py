from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.moderation import ModerationAction, UserStrike
from app.models.user import User
from app.core.config import settings
from app.services.notifications import create_notification
from app.services.security_audit import create_domain_audit_log


FULL_BANS = {"temporary_ban", "permanent_ban"}
MODERATION_ACTION_LABELS = {
    "warning": "Figyelmeztetés",
    "auction_creation_ban": "Aukció-létrehozási tiltás",
    "bidding_ban": "Licitálási tiltás",
    "chat_ban": "Chatküldési tiltás",
    "temporary_ban": "Ideiglenes teljes tiltás",
    "permanent_ban": "Végleges tiltás",
}
STRIKE_SEVERITY_LABELS = {
    "low": "Alacsony",
    "medium": "Közepes",
    "high": "Magas",
    "critical": "Kritikus",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def moderation_action_label(action_type: str) -> str:
    return MODERATION_ACTION_LABELS.get(action_type, "Moderációs intézkedés")


def active_action_statement(user_id: int, action_types: set[str]):
    current_time = now_utc()
    return select(ModerationAction).where(
        ModerationAction.target_user_id == user_id,
        ModerationAction.action_type.in_(action_types),
        ModerationAction.revoked_at.is_(None),
        ModerationAction.starts_at <= current_time,
        or_(ModerationAction.expires_at.is_(None), ModerationAction.expires_at > current_time),
    )


def has_active_restriction(db: Session, user_id: int, *action_types: str) -> bool:
    return db.scalar(active_action_statement(user_id, set(action_types)).limit(1)) is not None


def require_no_restriction(db: Session, user_id: int, action_type: str) -> None:
    if has_active_restriction(db, user_id, action_type, *FULL_BANS):
        raise HTTPException(status_code=403, detail="A fiókod moderációs korlátozása miatt ez a művelet nem engedélyezett.")


def require_not_fully_banned(db: Session, user_id: int) -> None:
    if has_active_restriction(db, user_id, *FULL_BANS):
        raise HTTPException(status_code=403, detail="A felhasználói fiók moderációs tiltás alatt áll.")


def validate_target(admin: User, target: User) -> None:
    if target.role == "admin":
        raise HTTPException(status_code=403, detail="Adminisztrátori fiók ezen a felületen nem moderálható.")
    if target.id == admin.id:
        raise HTTPException(status_code=403, detail="Saját fiók nem moderálható.")


def issue_action(db: Session, admin: User, *, target: User, action_type: str, reason: str, internal_note: str | None, source_report_id: int | None, expires_at: datetime | None) -> ModerationAction:
    validate_target(admin, target)
    if action_type in {"auction_creation_ban", "bidding_ban", "chat_ban", "temporary_ban"} and expires_at is None:
        raise HTTPException(status_code=422, detail="Az ideiglenes vagy részleges tiltáshoz lejárat szükséges.")
    if expires_at is not None and expires_at <= now_utc():
        raise HTTPException(status_code=422, detail="A lejáratnak jövőbeli időpontnak kell lennie.")
    if action_type == "permanent_ban":
        existing = db.scalar(active_action_statement(target.id, {"permanent_ban"}).limit(1))
        if existing is not None:
            return existing
    action = ModerationAction(
        target_user_id=target.id,
        action_type=action_type,
        reason=reason,
        internal_note=internal_note,
        created_by_admin_id=admin.id,
        source_report_id=source_report_id,
        expires_at=expires_at,
    )
    db.add(action)
    db.flush()
    audit_action = "moderation_permanent_ban_applied" if action_type == "permanent_ban" else ("moderation_warning_issued" if action_type == "warning" else "moderation_restriction_applied")
    create_domain_audit_log(db, action=audit_action, user_id=admin.id, metadata={"target_user_id": target.id, "moderation_action_id": action.id, "type": action_type})
    create_notification(db, user_id=target.id, notification_type="moderation_action", title="Moderációs intézkedés", message=f"{moderation_action_label(action_type)}: {reason}", send_email=True)
    db.commit()
    db.refresh(action)
    return action


def issue_strike(db: Session, admin: User, *, target: User, reason: str, severity: str, source_report_id: int | None, expires_at: datetime | None) -> UserStrike:
    validate_target(admin, target)
    if expires_at is not None and expires_at <= now_utc():
        raise HTTPException(status_code=422, detail="A lejáratnak jövőbeli időpontnak kell lennie.")
    strike = UserStrike(user_id=target.id, reason=reason, severity=severity, source_report_id=source_report_id, issued_by_admin_id=admin.id, expires_at=expires_at)
    db.add(strike)
    db.flush()
    create_domain_audit_log(db, action="moderation_strike_issued", user_id=admin.id, metadata={"target_user_id": target.id, "strike_id": strike.id, "severity": severity})
    severity_label = STRIKE_SEVERITY_LABELS.get(severity, "Ismeretlen")
    create_notification(db, user_id=target.id, notification_type="moderation_strike", title="Moderációs figyelmeztető pont", message=f"Súlyosság: {severity_label}. Indok: {reason}", send_email=True)
    active_count = int(
        db.scalar(
            select(func.count()).select_from(UserStrike).where(
                UserStrike.user_id == target.id,
                UserStrike.revoked_at.is_(None),
                or_(UserStrike.expires_at.is_(None), UserStrike.expires_at > now_utc()),
            )
        ) or 0
    )
    if active_count >= settings.moderation_strike_alert_threshold:
        create_domain_audit_log(db, action="moderation_strike_threshold_reached", user_id=admin.id, metadata={"target_user_id": target.id, "active_strikes": active_count})
        admin_ids = list(db.scalars(select(User.id).where(User.role == "admin", User.is_active.is_(True), User.deleted_at.is_(None))).all())
        for admin_id in admin_ids:
            create_notification(db, user_id=admin_id, notification_type="moderation_action", title="Moderációs felülvizsgálat szükséges", message=f"{target.username} aktív strike-jainak száma: {active_count}. Emberi döntés szükséges.", send_email=False)
    db.commit()
    db.refresh(strike)
    return strike


def revoke_action(db: Session, admin: User, action: ModerationAction) -> ModerationAction:
    if action.revoked_at is None:
        action.revoked_at = now_utc()
        action.revoked_by_admin_id = admin.id
        db.add(action)
        create_domain_audit_log(db, action="moderation_permanent_ban_revoked" if action.action_type == "permanent_ban" else "moderation_restriction_revoked", user_id=admin.id, metadata={"target_user_id": action.target_user_id, "moderation_action_id": action.id})
        create_notification(db, user_id=action.target_user_id, notification_type="moderation_revoked", title="Korlátozás visszavonva", message=f"A(z) {moderation_action_label(action.action_type)} intézkedést visszavontuk.", send_email=True)
        db.commit()
        db.refresh(action)
    return action


def revoke_strike(db: Session, admin: User, strike: UserStrike) -> UserStrike:
    if strike.revoked_at is None:
        strike.revoked_at = now_utc()
        strike.revoked_by_admin_id = admin.id
        db.add(strike)
        create_domain_audit_log(db, action="moderation_strike_revoked", user_id=admin.id, metadata={"target_user_id": strike.user_id, "strike_id": strike.id})
        db.commit()
        db.refresh(strike)
    return strike


def moderation_overview(db: Session) -> tuple[list[ModerationAction], list[UserStrike]]:
    actions = list(db.scalars(select(ModerationAction).options(joinedload(ModerationAction.target_user)).order_by(ModerationAction.created_at.desc(), ModerationAction.id.desc()).limit(200)).all())
    strikes = list(db.scalars(select(UserStrike).options(joinedload(UserStrike.user)).order_by(UserStrike.issued_at.desc(), UserStrike.id.desc()).limit(200)).all())
    return actions, strikes
