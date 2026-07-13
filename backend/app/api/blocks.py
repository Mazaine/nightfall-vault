from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.moderation import UserBlock
from app.models.user import User
from app.schemas.moderation import BlockRead, BlockStatusRead
from app.services.user_blocks import create_user_block, delete_user_block, get_active_user_by_username, is_blocked_by

router = APIRouter(prefix="/api/blocks", tags=["blocks"])


def _block_read(block: UserBlock) -> BlockRead:
    return BlockRead(username=block.blocked.username, full_name=block.blocked.full_name, blocked_at=block.created_at)


@router.post("/{username}", response_model=BlockRead, status_code=201)
def block_user(username: str, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> BlockRead:
    blocked = get_active_user_by_username(db, username)
    block = create_user_block(db, current_user, blocked)
    return _block_read(block)


@router.delete("/{username}", status_code=204)
def unblock_user(username: str, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> None:
    blocked = get_active_user_by_username(db, username)
    delete_user_block(db, current_user, blocked)


@router.get("", response_model=list[BlockRead])
def list_blocks(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[BlockRead]:
    blocks = db.scalars(select(UserBlock).where(UserBlock.blocker_id == current_user.id).order_by(UserBlock.created_at.desc(), UserBlock.id.desc())).all()
    return [_block_read(block) for block in blocks]


@router.get("/{username}/status", response_model=BlockStatusRead)
def get_block_status(username: str, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> BlockStatusRead:
    other = get_active_user_by_username(db, username)
    return BlockStatusRead(
        username=other.username,
        is_blocked=is_blocked_by(db, current_user.id, other.id),
        is_blocked_by_user=is_blocked_by(db, other.id, current_user.id),
    )
