from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.models.moderation import UserBlock
from app.models.user import SellerFollow, User
from app.services.security_audit import create_domain_audit_log


def get_active_user_by_username(db: Session, username: str) -> User:
    user = db.scalar(select(User).where(User.username == username, User.deleted_at.is_(None), User.is_active.is_(True)))
    if user is None:
        raise HTTPException(status_code=404, detail="A felhasználó nem található.")
    return user


def has_block_between(db: Session, first_user_id: int, second_user_id: int) -> bool:
    return db.scalar(
        select(UserBlock.id).where(
            or_(
                (UserBlock.blocker_id == first_user_id) & (UserBlock.blocked_id == second_user_id),
                (UserBlock.blocker_id == second_user_id) & (UserBlock.blocked_id == first_user_id),
            )
        )
    ) is not None


def is_blocked_by(db: Session, blocker_id: int, blocked_id: int) -> bool:
    return db.scalar(select(UserBlock.id).where(UserBlock.blocker_id == blocker_id, UserBlock.blocked_id == blocked_id)) is not None


def ensure_not_blocked(db: Session, first_user_id: int, second_user_id: int, message: str = "A művelet blokkolás miatt nem engedélyezett.") -> None:
    if has_block_between(db, first_user_id, second_user_id):
        raise HTTPException(status_code=403, detail=message)


def create_user_block(db: Session, blocker: User, blocked: User) -> UserBlock:
    if blocker.id == blocked.id:
        raise HTTPException(status_code=409, detail="Saját profilt nem lehet blokkolni.")
    existing = db.scalar(select(UserBlock).where(UserBlock.blocker_id == blocker.id, UserBlock.blocked_id == blocked.id))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Ez a felhasználó már blokkolva van.")
    db.execute(
        delete(SellerFollow).where(
            or_(
                (SellerFollow.follower_id == blocker.id) & (SellerFollow.seller_id == blocked.id),
                (SellerFollow.follower_id == blocked.id) & (SellerFollow.seller_id == blocker.id),
            )
        )
    )
    block = UserBlock(blocker_id=blocker.id, blocked_id=blocked.id)
    db.add(block)
    create_domain_audit_log(db, action="user_block_created", user_id=blocker.id, metadata={"blocked_user_id": blocked.id})
    db.commit()
    db.refresh(block)
    return block


def delete_user_block(db: Session, blocker: User, blocked: User) -> None:
    block = db.scalar(select(UserBlock).where(UserBlock.blocker_id == blocker.id, UserBlock.blocked_id == blocked.id))
    if block is None:
        raise HTTPException(status_code=404, detail="A blokkolás nem található.")
    db.delete(block)
    create_domain_audit_log(db, action="user_block_removed", user_id=blocker.id, metadata={"blocked_user_id": blocked.id})
    db.commit()
