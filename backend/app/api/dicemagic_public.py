"""Customer DiceMagic checkout endpoints. Admin reconciliation stays admin-only."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dicemagic import ShopCartItem, Send, add_shop_cart
from app.core.config import settings
from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.user import User
from app.services.dicemagic import send_order, state
from app.services.dicemagic_access import can_buy_dicemagic

router = APIRouter(prefix="/api/shop/dicemagic", tags=["dicemagic-shop"])


@router.get("/status")
def buyer_status(user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    config = state(db)
    return {
        "enabled": can_buy_dicemagic(user) and settings.dicemagic_enabled,
        "orders_enabled": config.orders_enabled,
        "order_environment_enabled": settings.dicemagic_real_order_enabled,
    }


@router.post("/cart")
def buyer_cart(payload: ShopCartItem, user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    if not can_buy_dicemagic(user) or not settings.dicemagic_enabled:
        raise HTTPException(status_code=404, detail="A bolti termék nem található.")
    return add_shop_cart(payload, user=user, db=db)


@router.post("/orders/{order_id}/send")
def buyer_send(order_id: int, payload: Send, request: Request, user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    if not payload.confirm_real_order:
        raise HTTPException(status_code=422, detail="A valódi rendelés elküldését meg kell erősíteni.")
    if not can_buy_dicemagic(user):
        raise HTTPException(status_code=404, detail="A rendelés nem található.")
    check_rate_limit(request, "dicemagic:send", 6, str(user.id))
    return send_order(db, order_id, user)
