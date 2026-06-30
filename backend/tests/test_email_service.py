from types import SimpleNamespace

from app.services.email_templates import render_email_template


def test_order_created_email_contains_product() -> None:
    order = SimpleNamespace(order_number="WS-2026-000001", total_amount=4990, items=[SimpleNamespace(product_name="Template Product", quantity=1, total_price=4990)])
    subject, html = render_email_template("order_created", {"order": order})
    assert "Order confirmation" in subject
    assert "Template Product" in html


def test_password_reset_email_uses_supplied_url() -> None:
    subject, html = render_email_template("password_reset", {"reset_url": "https://example.com/reset?token=test"})
    assert subject == "Password reset"
    assert "https://example.com/reset?token=test" in html
