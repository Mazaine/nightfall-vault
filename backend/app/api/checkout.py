from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.dependencies.auth import get_optional_current_user
from app.models.order import Order, OrderItem
from app.models.pickup_point import PickupPoint
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.shipping import ShippingMethod
from app.models.user import User
from app.schemas.order import OrderCreate, OrderCreateItem, OrderDetailRead
from app.schemas.shipping import ShippingCartItem
from app.services.captcha_service import verify_captcha
from app.services.email_service import send_order_admin_notification_email, send_order_created_email
from app.services.shipping_service import get_available_shipping_methods
from app.services.stock_movements import create_stock_movement

router = APIRouter(prefix="/api/checkout", tags=["checkout"])
logger = logging.getLogger(__name__)

SUPPORTED_PAYMENT_METHODS = {"bank_transfer"}
PICKUP_REQUIRED_SHIPPING_CODES = {"package_pickup"}
PICKUP_REQUIRED_KEYWORDS = ("pickup", "point", "parcel", "automata", "foxpost", "postapont", "mpl")
DIGITAL_OR_PERSONAL_SHIPPING_CODES = {"digital", "personal_pickup"}
DIGITAL_OR_PERSONAL_KEYWORDS = ("personal", "digital")
DIGITAL_SHIPPING_METHOD = "digital"


def create_order_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"WS-{year}-"
    order_count = db.scalar(select(func.count()).select_from(Order).where(Order.order_number.like(f"{prefix}%"))) or 0
    next_number = int(order_count) + 1
    for _ in range(100):
        order_number = f"{prefix}{next_number:06d}"
        if db.scalar(select(Order).where(Order.order_number == order_number)) is None:
            return order_number
        next_number += 1
    raise HTTPException(status_code=500, detail="Could not generate order number.")


def get_product_price(product: Product, variant: ProductVariant | None) -> int:
    if variant is not None and variant.normal_price_huf is not None:
        return variant.normal_price_huf
    return product.normal_price_huf


def build_pickup_point_snapshot(pickup_point: PickupPoint) -> dict[str, object | None]:
    return {
        "id": pickup_point.id,
        "carrier": pickup_point.carrier,
        "external_id": pickup_point.external_id,
        "name": pickup_point.name,
        "zip": pickup_point.zip,
        "city": pickup_point.city,
        "address": pickup_point.address,
        "latitude": pickup_point.latitude,
        "longitude": pickup_point.longitude,
        "opening_hours": pickup_point.opening_hours,
        "comment": pickup_point.comment,
    }


def build_shipping_address_snapshot(checkout_create: OrderCreate) -> dict[str, str | None]:
    return {"zip": checkout_create.shipping_zip, "city": checkout_create.shipping_city, "address": checkout_create.shipping_address}


def normalize_shipping_text(value: str | None) -> str:
    return (value or "").strip().lower()


def shipping_method_requires_pickup(shipping_method: ShippingMethod) -> bool:
    shipping_text = " ".join([normalize_shipping_text(shipping_method.code), normalize_shipping_text(shipping_method.name), normalize_shipping_text(shipping_method.description)])
    return shipping_method.code in PICKUP_REQUIRED_SHIPPING_CODES or any(keyword in shipping_text for keyword in PICKUP_REQUIRED_KEYWORDS)


def shipping_method_requires_address(shipping_method: ShippingMethod) -> bool:
    shipping_text = " ".join([normalize_shipping_text(shipping_method.code), normalize_shipping_text(shipping_method.name), normalize_shipping_text(shipping_method.description)])
    if shipping_method.code in DIGITAL_OR_PERSONAL_SHIPPING_CODES:
        return False
    if any(keyword in shipping_text for keyword in DIGITAL_OR_PERSONAL_KEYWORDS):
        return False
    return not shipping_method_requires_pickup(shipping_method)


def get_shipping_method_for_order(db: Session, checkout_items: list[OrderCreateItem], shipping_method_code: str) -> ShippingMethod:
    shipping_items = [ShippingCartItem(product_id=item.product_id, quantity=item.quantity) for item in checkout_items]
    _total_booster_equivalent, available_methods = get_available_shipping_methods(db, shipping_items)
    matching_method = next((method for method in available_methods if method.code == shipping_method_code), None)
    if matching_method is None:
        raise HTTPException(status_code=400, detail="Selected shipping method is not available for this cart.")
    return matching_method


def is_product_out_of_stock(product: Product, stock_source: Product | ProductVariant, quantity: int) -> bool:
    if product.stock_status == "out_of_stock":
        return True
    if isinstance(stock_source, Product) and product.manage_stock:
        return stock_source.stock_quantity < quantity
    if isinstance(stock_source, ProductVariant):
        return stock_source.stock_quantity < quantity
    return False


@router.post("", response_model=OrderDetailRead, status_code=status.HTTP_201_CREATED)
def create_checkout_order(
    checkout_create: OrderCreate,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> OrderDetailRead:
    if not checkout_create.items:
        raise HTTPException(status_code=400, detail="Cart cannot be empty.")

    verify_captcha(checkout_create.captcha_token or checkout_create.turnstile_token, action="checkout")

    if checkout_create.payment_method not in SUPPORTED_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Only bank transfer is currently supported.")

    if not checkout_create.shipping_method:
        raise HTTPException(status_code=400, detail="Shipping method is required.")
    shipping_method = get_shipping_method_for_order(db=db, checkout_items=checkout_create.items, shipping_method_code=checkout_create.shipping_method)

    pickup_point_snapshot = None
    shipping_address_snapshot = None
    if shipping_method_requires_pickup(shipping_method):
        if checkout_create.pickup_point_id is None:
            raise HTTPException(status_code=400, detail="Pickup point is required for this shipping method.")
        pickup_point = db.get(PickupPoint, checkout_create.pickup_point_id)
        if pickup_point is None:
            raise HTTPException(status_code=400, detail="Selected pickup point was not found.")
        pickup_point_snapshot = build_pickup_point_snapshot(pickup_point)
    elif shipping_method_requires_address(shipping_method):
        if not checkout_create.shipping_zip or not checkout_create.shipping_city or not checkout_create.shipping_address:
            raise HTTPException(status_code=400, detail="Shipping ZIP, city and address are required for this method.")
        shipping_address_snapshot = build_shipping_address_snapshot(checkout_create)

    order_items: list[OrderItem] = []
    stock_movements: list[tuple[int, int, str]] = []
    products_total = 0

    for item in checkout_create.items:
        product = db.get(Product, item.product_id)
        if product is None:
            raise HTTPException(status_code=400, detail="Product not found.")
        if not product.is_active:
            raise HTTPException(status_code=400, detail=f"Product is not orderable: {product.name}")

        variant: ProductVariant | None = None
        product_name = product.name
        stock_source: Product | ProductVariant = product
        if item.variant_id is not None:
            variant = db.get(ProductVariant, item.variant_id)
            if variant is None or variant.product_id != product.id:
                raise HTTPException(status_code=400, detail=f"Product variant was not found: {product.name}")
            if not variant.is_active:
                raise HTTPException(status_code=400, detail=f"Product variant is not orderable: {variant.name}")
            product_name = f"{product.name} - {variant.name}"
            stock_source = variant

        if is_product_out_of_stock(product, stock_source, item.quantity):
            raise HTTPException(status_code=400, detail=f"Not enough stock for: {product_name}")

        unit_price = get_product_price(product, variant)
        line_total = unit_price * item.quantity
        products_total += line_total
        if isinstance(stock_source, ProductVariant) or product.manage_stock:
            stock_source.stock_quantity -= item.quantity
            if isinstance(stock_source, Product) and stock_source.stock_quantity <= 0:
                stock_source.stock_status = "out_of_stock"
            db.add(stock_source)
            stock_movements.append((product.id, -item.quantity, product_name))

        order_items.append(OrderItem(product_id=product.id, product_name=product_name, quantity=item.quantity, unit_price=unit_price, total_price=line_total))

    shipping_price = shipping_method.price
    order = Order(
        order_number=create_order_number(db),
        user_id=current_user.id if current_user else None,
        customer_name=checkout_create.customer_name,
        customer_email=checkout_create.customer_email,
        customer_phone=checkout_create.customer_phone,
        status="pending_payment",
        total_amount=products_total + shipping_price,
        shipping_method=shipping_method.code,
        shipping_price=shipping_price,
        pickup_point_snapshot=pickup_point_snapshot,
        shipping_address_snapshot=shipping_address_snapshot,
        payment_method="bank_transfer",
        payment_status="pending",
        source="webshop",
        items=order_items,
    )

    db.add(order)
    db.flush()
    for product_id, quantity_change, product_name in stock_movements:
        create_stock_movement(db=db, product_id=product_id, order_id=order.id, quantity_change=quantity_change, movement_type="order_created", note=f"Order created: {order.order_number} - {product_name}")
    db.commit()

    created_order = db.scalar(select(Order).options(selectinload(Order.items)).where(Order.id == order.id))
    if created_order is None:
        raise HTTPException(status_code=500, detail="Order creation failed.")

    try:
        send_order_created_email(created_order)
    except Exception:
        logger.exception("Order confirmation email failed: %s", created_order.order_number)
    try:
        send_order_admin_notification_email(created_order)
    except Exception:
        logger.exception("Admin order notification email failed: %s", created_order.order_number)

    return OrderDetailRead.model_validate(created_order)
