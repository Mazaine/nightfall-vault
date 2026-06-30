from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.crud.product import get_featured_products, get_product_by_slug, get_products
from app.db.session import get_db
from app.schemas.product import ProductRead

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=list[ProductRead])
def list_products(
    search: str | None = None,
    category_slug: str | None = None,
    subcategory_slug: str | None = None,
    show_sale_only: bool = False,
    db: Session = Depends(get_db),
) -> list[ProductRead]:
    return get_products(
        db=db,
        search=search,
        category_slug=category_slug,
        subcategory_slug=subcategory_slug,
        show_sale_only=show_sale_only,
    )


@router.get("/featured", response_model=list[ProductRead])
def list_featured_products(db: Session = Depends(get_db)) -> list[ProductRead]:
    return get_featured_products(db)


@router.get("/{slug}", response_model=ProductRead)
def get_product(slug: str, db: Session = Depends(get_db)) -> ProductRead:
    product = get_product_by_slug(db, slug)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
