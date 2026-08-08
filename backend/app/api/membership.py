from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
from app.core.rate_limit import check_rate_limit
from app.dependencies.auth import require_active_user, require_admin
from app.models.user import User, VipActivationCode
from app.schemas.membership import VipActivateRequest, VipActivationRead, VipCodeAdminRead, VipCodeBatchRead, VipCodeGenerateRequest, VipGeneratedCode, VipReminderPreferencesUpdate, VipStatusRead
from app.services.membership import NORMAL_ACTIVE_AUCTION_LIMIT, activate_code, active_auction_count, decrypt_vip_code, generate_codes, is_vip
from app.services.security_audit import create_domain_audit_log
from app.models.auction import Auction, WatchlistItem
from app.models.notification import WatchlistReminder

router = APIRouter(tags=["membership"])


def membership_status(db: Session, user: User) -> VipStatusRead:
    vip = is_vip(user)
    return VipStatusRead(
        is_vip=vip,
        vip_expires_at=user.vip_expires_at,
        active_auction_limit=None if vip else NORMAL_ACTIVE_AUCTION_LIMIT,
        active_auction_count=active_auction_count(db, user.id),
        featured_auctions=vip,
        reminder_one_day=user.vip_reminder_one_day,
        reminder_one_hour=user.vip_reminder_one_hour,
        reminder_five_minutes=user.vip_reminder_five_minutes,
    )


@router.get("/api/membership", response_model=VipStatusRead)
def get_membership(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> VipStatusRead:
    return membership_status(db, current_user)


@router.patch("/api/membership/reminders", response_model=VipStatusRead)
def update_vip_reminders(payload: VipReminderPreferencesUpdate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> VipStatusRead:
    if not is_vip(current_user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Az aukciólejárati emlékeztetők csak aktív VIP-tagsággal állíthatók be.")
    current_user.vip_reminder_one_day = payload.reminder_one_day
    current_user.vip_reminder_one_hour = payload.reminder_one_hour
    current_user.vip_reminder_five_minutes = payload.reminder_five_minutes
    selected = {1440: payload.reminder_one_day, 60: payload.reminder_one_hour, 5: payload.reminder_five_minutes}
    auction_ids = db.scalars(
        select(WatchlistItem.auction_id).join(Auction, Auction.id == WatchlistItem.auction_id)
        .where(WatchlistItem.user_id == current_user.id, Auction.status == "active")
    ).all()
    for auction_id in auction_ids:
        for minutes_before, enabled in selected.items():
            if enabled and db.scalar(select(WatchlistReminder.id).where(
                WatchlistReminder.user_id == current_user.id,
                WatchlistReminder.auction_id == auction_id,
                WatchlistReminder.minutes_before == minutes_before,
            )) is None:
                db.add(WatchlistReminder(user_id=current_user.id, auction_id=auction_id, minutes_before=minutes_before))
    create_domain_audit_log(db, action="vip_reminder_preferences_updated", user_id=current_user.id, metadata=payload.model_dump())
    db.commit()
    db.refresh(current_user)
    return membership_status(db, current_user)


@router.post("/api/membership/activate", response_model=VipActivationRead)
def activate_membership(payload: VipActivateRequest, request: Request, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> VipActivationRead:
    check_rate_limit(request, "membership:activate", settings.vip_activation_rate_limit_per_minute, str(current_user.id))
    expires_at = activate_code(db, current_user, payload.code)
    status = membership_status(db, current_user)
    return VipActivationRead(**status.model_dump(), message="A VIP-tagság sikeresen aktiválva lett.")


@router.post("/api/admin/vip-codes/generate", response_model=VipCodeBatchRead)
def generate_vip_codes(payload: VipCodeGenerateRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> VipCodeBatchRead:
    batch_id, created_at, codes = generate_codes(db, admin, payload.quantity, payload.duration_months)
    return VipCodeBatchRead(
        batch_id=batch_id,
        duration_months=payload.duration_months,
        quantity=len(codes),
        created_at=created_at,
        codes=[VipGeneratedCode(code=code, duration_months=payload.duration_months) for code in codes],
    )


@router.get("/api/admin/vip-codes", response_model=list[VipCodeAdminRead])
def list_vip_codes(limit: int = Query(default=1000, ge=1, le=5000), admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[VipCodeAdminRead]:
    del admin
    codes = db.scalars(select(VipActivationCode).order_by(VipActivationCode.created_at.desc(), VipActivationCode.id.desc()).limit(limit)).all()
    return [VipCodeAdminRead(
        id=item.id,
        code=decrypt_vip_code(item.code_ciphertext),
        masked_code=f"•••• •••• {item.code_last_four}",
        duration_months=item.duration_months,
        batch_id=item.batch_id,
        created_at=item.created_at,
        redeemed_at=item.redeemed_at,
        redeemed_by_username=item.redeemed_by_user.username if item.redeemed_by_user else None,
    ) for item in codes]
