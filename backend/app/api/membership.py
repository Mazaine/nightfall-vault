from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user, require_admin
from app.models.user import User, VipActivationCode
from app.schemas.membership import VipActivateRequest, VipActivationRead, VipCodeAdminRead, VipCodeBatchRead, VipCodeGenerateRequest, VipGeneratedCode, VipStatusRead
from app.services.membership import NORMAL_ACTIVE_AUCTION_LIMIT, activate_code, active_auction_count, decrypt_vip_code, generate_codes, is_vip

router = APIRouter(tags=["membership"])


def membership_status(db: Session, user: User) -> VipStatusRead:
    vip = is_vip(user)
    return VipStatusRead(
        is_vip=vip,
        vip_expires_at=user.vip_expires_at,
        active_auction_limit=None if vip else NORMAL_ACTIVE_AUCTION_LIMIT,
        active_auction_count=active_auction_count(db, user.id),
        featured_auctions=vip,
    )


@router.get("/api/membership", response_model=VipStatusRead)
def get_membership(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> VipStatusRead:
    return membership_status(db, current_user)


@router.post("/api/membership/activate", response_model=VipActivationRead)
def activate_membership(payload: VipActivateRequest, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> VipActivationRead:
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
