from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.user import SavedSearch, User
from app.schemas.search import SavedSearchCreate, SavedSearchRead

router = APIRouter(prefix="/api/searches", tags=["saved-searches"])


@router.post("", response_model=SavedSearchRead, status_code=status.HTTP_201_CREATED)
def create_saved_search(payload: SavedSearchCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> SavedSearchRead:
    saved_search = SavedSearch(user_id=current_user.id, **payload.model_dump())
    db.add(saved_search)
    db.commit()
    db.refresh(saved_search)
    return SavedSearchRead.model_validate(saved_search)


@router.get("", response_model=list[SavedSearchRead])
def list_saved_searches(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[SavedSearchRead]:
    statement = select(SavedSearch).where(SavedSearch.user_id == current_user.id).order_by(SavedSearch.created_at.desc(), SavedSearch.id.desc())
    return [SavedSearchRead.model_validate(item) for item in db.scalars(statement).all()]


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_search(search_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> Response:
    saved_search = db.get(SavedSearch, search_id)
    if saved_search is None or saved_search.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="A mentett keresés nem található.")
    db.delete(saved_search)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
