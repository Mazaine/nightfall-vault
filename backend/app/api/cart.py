from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.user import User
from app.schemas.cart import CartItemCreate, CartItemUpdate, CartRead, CheckoutCreate, CheckoutResult
from app.services.cart import add_cart_item, checkout_cart, get_cart, remove_cart_item, renew_cart_item, update_cart_item


router = APIRouter(prefix="/api/cart", tags=["cart"])


@router.get("", response_model=CartRead)
def read_cart(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CartRead:
    return CartRead.model_validate(get_cart(db, current_user.id))


@router.post("/items", response_model=CartRead, status_code=status.HTTP_201_CREATED)
def add_item(payload: CartItemCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CartRead:
    return CartRead.model_validate(add_cart_item(db, current_user, payload.auction_id, payload.quantity))


@router.patch("/items/{item_id}", response_model=CartRead)
def change_item(item_id: int, payload: CartItemUpdate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CartRead:
    return CartRead.model_validate(update_cart_item(db, current_user, item_id, payload.quantity, accept_price=payload.accept_price))


@router.delete("/items/{item_id}", response_model=CartRead)
def delete_item(item_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CartRead:
    return CartRead.model_validate(remove_cart_item(db, current_user, item_id))


@router.post("/items/{item_id}/reserve", response_model=CartRead)
def reserve_again(item_id: int, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CartRead:
    return CartRead.model_validate(renew_cart_item(db, current_user, item_id))


@router.post("/checkout", response_model=CheckoutResult)
def checkout(payload: CheckoutCreate, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> CheckoutResult:
    return CheckoutResult.model_validate(checkout_cart(db, current_user, payload.idempotency_key, payload.item_ids))
