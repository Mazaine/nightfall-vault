from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.moderation import ModerationAction, UserStrike
from app.models.user import User
from app.schemas.moderation_actions import ModerationActionCreate, ModerationActionRead, ModerationOverview, StrikeCreate, UserStrikeRead
from app.services.moderation_actions import issue_action, issue_strike, moderation_overview, revoke_action, revoke_strike


router = APIRouter(prefix="/api/admin/moderation", tags=["admin-moderation"])


def target_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")
    return user


@router.get("", response_model=ModerationOverview)
def get_moderation_overview(_admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> ModerationOverview:
    actions, strikes = moderation_overview(db)
    return ModerationOverview(actions=[ModerationActionRead.model_validate(item) for item in actions], strikes=[UserStrikeRead.model_validate(item) for item in strikes])


@router.post("/actions", response_model=ModerationActionRead, status_code=201)
def create_moderation_action(payload: ModerationActionCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> ModerationActionRead:
    action = issue_action(db, admin, target=target_or_404(db, payload.target_user_id), action_type=payload.action_type, reason=payload.reason, internal_note=payload.internal_note, source_report_id=payload.source_report_id, expires_at=payload.expires_at)
    return ModerationActionRead.model_validate(action)


@router.post("/strikes", response_model=UserStrikeRead, status_code=201)
def create_user_strike(payload: StrikeCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> UserStrikeRead:
    strike = issue_strike(db, admin, target=target_or_404(db, payload.target_user_id), reason=payload.reason, severity=payload.severity, source_report_id=payload.source_report_id, expires_at=payload.expires_at)
    return UserStrikeRead.model_validate(strike)


@router.post("/actions/{action_id}/revoke", response_model=ModerationActionRead)
def revoke_moderation_action(action_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> ModerationActionRead:
    action = db.get(ModerationAction, action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Az intézkedés nem található.")
    return ModerationActionRead.model_validate(revoke_action(db, admin, action))


@router.post("/strikes/{strike_id}/revoke", response_model=UserStrikeRead)
def revoke_user_strike(strike_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> UserStrikeRead:
    strike = db.get(UserStrike, strike_id)
    if strike is None:
        raise HTTPException(status_code=404, detail="A strike nem található.")
    return UserStrikeRead.model_validate(revoke_strike(db, admin, strike))
