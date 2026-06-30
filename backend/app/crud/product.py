from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.category import Category
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate

SALE_BADGES = ["Sale", "Discount", "Akcios", "Akcios"]


def sync_product_stock_status(product: Product) -> None:
    if product.manage_stock and product.stock_quantity <= 0:
        product.stock_status = "out_of_stock"


def get_products(
    db: Session,
    search: str | None = None,
    category_slug: str | None = None,
    subcategory_slug: str | None = None,
    show_sale_only: bool = False,
) -> list[Product]:
    statement = select(Product).options(selectinload(Product.variants)).where(Product.is_active.is_(True))

    if category_slug:
        statement = statement.join(Category).where(Category.slug == category_slug)
    if subcategory_slug:
        statement = statement.where(Product.subcategory_slug == subcategory_slug)
    if search:
        search_pattern = f"%{search.strip()}%"
        statement = statement.where(
            Product.name.ilike(search_pattern)
            | Product.short_description.ilike(search_pattern)
            | Product.subcategory_name.ilike(search_pattern)
            | Product.subcategory_slug.ilike(search_pattern)
        )
    if show_sale_only:
        statement = statement.where(Product.badge_label.in_(SALE_BADGES))

    return list(db.scalars(statement.order_by(Product.created_at.desc(), Product.id.desc())).all())


def get_featured_products(db: Session) -> list[Product]:
    statement = (
        select(Product)
        .options(selectinload(Product.variants))
        .where(Product.is_active.is_(True), Product.is_featured.is_(True))
        .order_by(Product.created_at.desc(), Product.id.desc())
    )
    return list(db.scalars(statement).all())


def get_product_by_slug(db: Session, slug: str) -> Product | None:
    statement = select(Product).options(selectinload(Product.variants)).where(Product.is_active.is_(True), Product.slug == slug)
    return db.scalar(statement)


def get_admin_products(db: Session) -> list[Product]:
    statement = select(Product).options(selectinload(Product.variants)).order_by(Product.created_at.desc(), Product.id.desc())
    return list(db.scalars(statement).all())


def get_product_by_id(db: Session, product_id: int) -> Product | None:
    return db.get(Product, product_id)


def get_any_product_by_slug(db: Session, slug: str) -> Product | None:
    return db.scalar(select(Product).where(Product.slug == slug))


def create_product(db: Session, product_create: ProductCreate) -> Product:
    product = Product(**product_create.model_dump())
    sync_product_stock_status(product)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(db: Session, product: Product, product_update: ProductUpdate) -> Product:
    for field_name, value in product_update.model_dump(exclude_unset=True).items():
        setattr(product, field_name, value)
    sync_product_stock_status(product)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def deactivate_product(db: Session, product: Product) -> Product:
    product.is_active = False
    db.add(product)
    db.commit()
    db.refresh(product)
    return product
