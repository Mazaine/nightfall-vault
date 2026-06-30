from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.crud.category import get_active_categories
from app.db.session import get_db
from app.schemas.category import CategoryRead

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)) -> list[CategoryRead]:
    return get_active_categories(db)
