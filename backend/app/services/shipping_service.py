from sqlalchemy.orm import Session

from app.models.product import Product
from app.schemas.shipping import ShippingCartItem
from app.models.shipping import ShippingMethod


def calculate_booster_equivalent(product: Product, quantity: int) -> float:
    unit_value = product.shipping_unit_value or 1
    return float(unit_value * quantity)


def get_available_shipping_methods(db: Session, items: list[ShippingCartItem]) -> tuple[float, list[ShippingMethod]]:
    total = 0.0
    for item in items:
        product = db.get(Product, item.product_id)
        if product is not None:
            total += calculate_booster_equivalent(product, item.quantity)

    methods = db.query(ShippingMethod).filter(ShippingMethod.is_active.is_(True)).order_by(ShippingMethod.sort_order, ShippingMethod.id).all()
    available = []
    for method in methods:
        min_value = float(method.min_booster_equivalent) if method.min_booster_equivalent is not None else None
        max_value = float(method.max_booster_equivalent) if method.max_booster_equivalent is not None else None
        if min_value is not None and total < min_value:
            continue
        if max_value is not None and total > max_value:
            continue
        available.append(method)
    return total, available
