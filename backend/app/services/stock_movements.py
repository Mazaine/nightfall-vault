from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.user import User


def create_stock_movement(
    db: Session,
    product_id: int,
    quantity_change: int,
    movement_type: str,
    order_id: int | None = None,
    note: str | None = None,
    created_by_admin_id: int | None = None,
) -> StockMovement:
    movement = StockMovement(
        product_id=product_id,
        order_id=order_id,
        quantity_change=quantity_change,
        movement_type=movement_type,
        note=note,
        created_by_admin_id=created_by_admin_id,
    )
    db.add(movement)
    return movement


def release_order_stock(db: Session, order: Order, admin_user: User | None = None) -> None:
    if order.stock_released_at is not None:
        return

    for item in order.items:
        if item.product_id is None:
            continue

        product = db.get(Product, item.product_id)
        if product is None:
            continue

        product.stock_quantity += item.quantity
        db.add(product)
        create_stock_movement(
            db=db,
            product_id=product.id,
            order_id=order.id,
            quantity_change=item.quantity,
            movement_type="order_cancelled",
            note=f"Készlet visszaadva törölt rendelésből: {order.order_number}",
            created_by_admin_id=admin_user.id if admin_user else None,
        )

    order.stock_released_at = datetime.now(timezone.utc)
    db.add(order)


def adjust_product_stock(
    db: Session,
    product: Product,
    quantity_change: int,
    admin_user: User,
    note: str | None = None,
) -> Product:
    if quantity_change == 0:
        raise HTTPException(status_code=400, detail="A készletmódosítás nem lehet nulla.")

    next_stock = product.stock_quantity + quantity_change
    if next_stock < 0:
        raise HTTPException(status_code=400, detail="A készlet nem csökkenhet nulla alá.")

    product.stock_quantity = next_stock
    db.add(product)
    create_stock_movement(
        db=db,
        product_id=product.id,
        quantity_change=quantity_change,
        movement_type="admin_adjustment",
        note=note,
        created_by_admin_id=admin_user.id,
    )
    return product


def list_stock_movements(db: Session, product_id: int | None = None, limit: int = 200) -> list[StockMovement]:
    statement = select(StockMovement).order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit)
    if product_id is not None:
        statement = statement.where(StockMovement.product_id == product_id)
    return list(db.scalars(statement).all())
