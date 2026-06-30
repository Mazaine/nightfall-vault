from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.user import User
from app.schemas.order import MyOrderDetailRead, MyOrderRead

router = APIRouter(prefix="/api/orders", tags=["orders"])


def enrich_order_items_with_current_prices(order: Order) -> None:
    for item in order.items:
        if item.product_id is None:
            continue
        product = item.product if hasattr(item, "product") else None
        if product is None:
            continue
        item.unit_price = product.normal_price_huf
        item.total_price = item.unit_price * item.quantity


@router.get("/me", response_model=list[MyOrderRead])
def list_my_orders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MyOrderRead]:
    statement = select(Order).where(Order.user_id == current_user.id).order_by(Order.created_at.desc(), Order.id.desc())
    return list(db.scalars(statement).all())


@router.get("/me/{order_id}", response_model=MyOrderDetailRead)
def get_my_order(order_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MyOrderDetailRead:
    statement = select(Order).options(selectinload(Order.items)).where(Order.id == order_id, Order.user_id == current_user.id)
    order = db.scalar(statement)
    if order is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Order not found")
    return MyOrderDetailRead.model_validate(order)
