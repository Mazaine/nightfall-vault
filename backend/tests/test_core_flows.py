from app.core.config import settings
from app.models.product import Product
from app.schemas.order import OrderCreate, OrderCreateItem
from app.schemas.product import ProductCreate


def test_project_name_is_neutral() -> None:
    assert settings.project_name == "Webshop Template API"


def test_product_model_has_generic_commerce_fields() -> None:
    columns = Product.__table__.columns.keys()
    assert "normal_price_huf" in columns
    assert "stock_quantity" in columns
    assert "manage_stock" in columns


def test_product_create_schema_accepts_generic_product() -> None:
    product = ProductCreate(category_id=1, name="Template Product", slug="template-product", normal_price_huf=1990, stock_quantity=10)
    assert product.name == "Template Product"
    assert product.shipping_unit_type == "CUSTOM"


def test_order_create_schema_has_plain_money_items() -> None:
    order = OrderCreate(customer_name="Test Customer", customer_email="customer@example.com", shipping_method="standard", payment_method="bank_transfer", items=[OrderCreateItem(product_id=1, quantity=2)])
    assert order.items[0].quantity == 2
