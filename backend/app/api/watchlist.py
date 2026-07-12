from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.user import User
from app.schemas.auction import WatchlistItemRead
from app.services.watchlist import add_to_watchlist, list_watchlist, remove_from_watchlist

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistItemRead])
def get_watchlist(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[WatchlistItemRead]:
    return [WatchlistItemRead.model_validate(item) for item in list_watchlist(db, current_user)]


@router.post("/{auction_id}", response_model=WatchlistItemRead, status_code=status.HTTP_201_CREATED)
def add_watchlist_item(auction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> WatchlistItemRead:
    return WatchlistItemRead.model_validate(add_to_watchlist(db, auction_id, current_user))


@router.delete("/{auction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_watchlist_item(auction_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> None:
    remove_from_watchlist(db, auction_id, current_user)
