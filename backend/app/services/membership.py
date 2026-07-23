import calendar
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import case, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.models.auction import Auction
from app.models.user import User, VipActivationCode
from app.services.security_audit import create_domain_audit_log

NORMAL_ACTIVE_AUCTION_LIMIT = 3
LIVE_AUCTION_STATUSES = ("scheduled", "active")
VIP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
VIP_CODE_LENGTH = 12


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_vip(user: User, now: datetime | None = None) -> bool:
    current = now or utc_now()
    return user.role == "admin" or (user.vip_expires_at is not None and user.vip_expires_at > current)


def featured_auction_order():
    """SQL rendezési kifejezés: a VIP- és admineladók aukciói kerüljenek előre."""
    seller = aliased(User)
    has_featured_seller = exists(
        select(1)
        .select_from(seller)
        .where(
            seller.id == Auction.seller_id,
            or_(seller.role == "admin", seller.vip_expires_at > func.now()),
        )
    )
    return case((has_featured_seller, 1), else_=0).desc()


def vip_code_digest(code: str) -> str:
    return hmac.new(settings.secret_key.encode("utf-8"), code.encode("ascii"), hashlib.sha256).hexdigest()


def _vip_code_cipher() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_vip_code(code: str) -> str:
    return _vip_code_cipher().encrypt(code.encode("ascii")).decode("ascii")


def decrypt_vip_code(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    try:
        return _vip_code_cipher().decrypt(ciphertext.encode("ascii")).decode("ascii")
    except InvalidToken:
        return None


def add_calendar_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def active_auction_count(db: Session, user_id: int) -> int:
    return int(db.scalar(select(func.count()).select_from(Auction).where(
        Auction.seller_id == user_id,
        Auction.status.in_(LIVE_AUCTION_STATUSES),
        Auction.ends_at > utc_now(),
        Auction.deleted_at.is_(None),
    )) or 0)


def require_available_auction_slot(db: Session, user: User) -> None:
    locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None or is_vip(locked_user):
        return
    if active_auction_count(db, locked_user.id) >= NORMAL_ACTIVE_AUCTION_LIMIT:
        raise HTTPException(
            status_code=409,
            detail="Normál tagsággal egyszerre legfeljebb 3 aktív vagy időzített saját aukciód lehet. Zárj le egyet, vagy aktiválj VIP-tagságot.",
        )


def generate_codes(db: Session, admin: User, quantity: int, duration_months: int) -> tuple[str, datetime, list[str]]:
    batch_id = str(uuid4())
    created_at = utc_now()
    raw_codes: list[str] = []
    while len(raw_codes) < quantity:
        code = "".join(secrets.choice(VIP_CODE_ALPHABET) for _ in range(VIP_CODE_LENGTH))
        digest = vip_code_digest(code)
        if code in raw_codes or db.scalar(select(VipActivationCode.id).where(VipActivationCode.code_digest == digest)) is not None:
            continue
        db.add(VipActivationCode(
            code_digest=digest,
            code_ciphertext=encrypt_vip_code(code),
            code_last_four=code[-4:],
            duration_months=duration_months,
            batch_id=batch_id,
            created_by_admin_id=admin.id,
            created_at=created_at,
        ))
        raw_codes.append(code)
    create_domain_audit_log(db, action="vip_codes_generated", user_id=admin.id, metadata={"batch_id": batch_id, "quantity": quantity, "duration_months": duration_months})
    db.commit()
    return batch_id, created_at, raw_codes


def activate_code(db: Session, user: User, raw_code: str) -> datetime:
    code = db.scalar(select(VipActivationCode).where(VipActivationCode.code_digest == vip_code_digest(raw_code)).with_for_update())
    if code is None:
        raise HTTPException(status_code=404, detail="A megadott VIP-kód nem érvényes.")
    if code.redeemed_at is not None:
        raise HTTPException(status_code=409, detail="Ezt a VIP-kódot már beváltották.")
    locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise HTTPException(status_code=404, detail="A felhasználói fiók nem található.")
    now = utc_now()
    base = locked_user.vip_expires_at if locked_user.vip_expires_at is not None and locked_user.vip_expires_at > now else now
    locked_user.vip_expires_at = add_calendar_months(base, code.duration_months)
    code.redeemed_by_user_id = user.id
    code.redeemed_at = now
    db.add_all([locked_user, code])
    create_domain_audit_log(db, action="vip_membership_activated", user_id=user.id, metadata={"duration_months": code.duration_months, "code_last_four": code.code_last_four, "batch_id": code.batch_id})
    db.commit()
    db.refresh(locked_user)
    user.vip_expires_at = locked_user.vip_expires_at
    return locked_user.vip_expires_at
