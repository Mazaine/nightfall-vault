from types import SimpleNamespace

from app.services.email_templates import render_email_template


def test_order_created_email_contains_product() -> None:
    order = SimpleNamespace(order_number="WS-2026-000001", total_amount=4990, items=[SimpleNamespace(product_name="Template Product", quantity=1, total_price=4990)])
    subject, html = render_email_template("order_created", {"order": order})
    assert "Order confirmation" in subject
    assert "Template Product" in html


def test_password_reset_email_uses_supplied_url() -> None:
    subject, html = render_email_template("password_reset", {"reset_url": "https://example.com/reset?token=test"})
    assert subject == "Nightfall Vault – jelszó-visszaállítás"
    assert "https://example.com/reset?token=test" in html
    assert "1 óráig" in html
    assert "Webshop Template" not in html


def test_verification_email_is_nightfall_branded() -> None:
    subject, html = render_email_template("email_verification", {"verification_url": "https://example.com/verify?token=test"})
    assert subject == "Nightfall Vault – fiókaktiválás"
    assert "Fiók aktiválása" in html
    assert "24 óráig" in html
    assert "Webshop Template" not in html
