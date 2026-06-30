from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category


def get_active_categories(db: Session) -> list[Category]:
    statement = (
        select(Category)
        .where(Category.is_active.is_(True))
        .order_by(Category.sort_order.asc(), Category.name.asc())
    )
    return list(db.scalars(statement).all())
