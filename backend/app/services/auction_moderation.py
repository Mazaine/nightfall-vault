from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auction import Auction
from app.models.user import User
from app.services.auction_lifecycle import now_utc
from app.services.security_audit import create_domain_audit_log

RESTORABLE_STATUSES = {"draft", "scheduled", "active", "ended"}


def suspend_auction(db: Session, auction: Auction, admin: User, reason: str) -> Auction:
    if auction.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Deleted auction cannot be suspended.")
    if auction.status == "suspended":
        raise HTTPException(status_code=409, detail="Auction is already suspended.")
    auction.moderation_previous_status = auction.status
    auction.status = "suspended"
    auction.moderated_at = now_utc()
    auction.moderated_by_admin_id = admin.id
    auction.moderation_reason = reason.strip()
    db.add(auction)
    create_domain_audit_log(db, action="auction_moderated_suspend", user_id=admin.id, auction_id=auction.id, metadata={"reason": auction.moderation_reason})
    db.commit()
    db.refresh(auction)
    return auction


def restore_auction(db: Session, auction: Auction, admin: User, reason: str) -> Auction:
    if auction.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Deleted auction cannot be restored.")
    if auction.status != "suspended":
        raise HTTPException(status_code=409, detail="Only suspended auctions can be restored.")
    target_status = auction.moderation_previous_status or "draft"
    if target_status not in RESTORABLE_STATUSES:
        target_status = "draft"
    auction.status = target_status
    auction.moderated_at = now_utc()
    auction.moderated_by_admin_id = admin.id
    auction.moderation_reason = reason.strip()
    auction.moderation_previous_status = None
    db.add(auction)
    create_domain_audit_log(db, action="auction_moderated_restore", user_id=admin.id, auction_id=auction.id, metadata={"reason": auction.moderation_reason, "restored_status": target_status})
    db.commit()
    db.refresh(auction)
    return auction


def soft_delete_auction(db: Session, auction: Auction, admin: User, reason: str) -> Auction:
    if auction.deleted_at is not None:
        return auction
    auction.deleted_at = now_utc()
    auction.moderated_at = auction.deleted_at
    auction.moderated_by_admin_id = admin.id
    auction.moderation_reason = reason.strip()
    db.add(auction)
    create_domain_audit_log(db, action="auction_moderated_delete", user_id=admin.id, auction_id=auction.id, metadata={"reason": auction.moderation_reason})
    db.commit()
    db.refresh(auction)
    return auction
