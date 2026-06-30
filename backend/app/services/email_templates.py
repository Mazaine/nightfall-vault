from typing import Any
import html


def base_layout(title: str, body: str) -> str:
    return f"""
    <html><body style="font-family: Arial, sans-serif; color: #111827;">
      <h1>{html.escape(title)}</h1>
      {body}
      <p style="color:#6b7280;font-size:12px;">Webshop Template</p>
    </body></html>
    """


def format_money(value: int) -> str:
    return f"{value:,} HUF".replace(",", " ")


def render_order_created(context: dict[str, Any]) -> tuple[str, str]:
    order = context["order"]
    rows = "".join(f"<li>{html.escape(item.product_name)} x {item.quantity} - {format_money(item.total_price)}</li>" for item in order.items)
    body = f"<p>Thank you for your order.</p><ul>{rows}</ul><p><strong>Total:</strong> {format_money(order.total_amount)}</p>"
    return f"Order confirmation - {order.order_number}", base_layout("Order confirmation", body)


def render_order_admin_notification(context: dict[str, Any]) -> tuple[str, str]:
    order = context["order"]
    body = f"<p>New order received: <strong>{html.escape(order.order_number)}</strong></p><p>{html.escape(order.customer_email)}</p>"
    return f"New order - {order.order_number}", base_layout("New order", body)


def render_order_completed(context: dict[str, Any]) -> tuple[str, str]:
    order = context["order"]
    body = f"<p>Your order <strong>{html.escape(order.order_number)}</strong> has been completed.</p>"
    return f"Order completed - {order.order_number}", base_layout("Order completed", body)


def render_password_reset(context: dict[str, Any]) -> tuple[str, str]:
    reset_url = html.escape(context["reset_url"])
    return "Password reset", base_layout("Password reset", f'<p>Set a new password here: <a href="{reset_url}">{reset_url}</a></p>')


def render_email_verification(context: dict[str, Any]) -> tuple[str, str]:
    verification_url = html.escape(context["verification_url"])
    return "Verify your account", base_layout("Verify your account", f'<p>Verify your email here: <a href="{verification_url}">{verification_url}</a></p>')


def render_newsletter(context: dict[str, Any]) -> tuple[str, str]:
    subject = str(context.get("subject", "Newsletter"))
    content_html = str(context.get("content_html", ""))
    return subject, base_layout(subject, content_html)


TEMPLATES = {
    "order_created": render_order_created,
    "order_admin_notification": render_order_admin_notification,
    "order_completed": render_order_completed,
    "password_reset": render_password_reset,
    "email_verification": render_email_verification,
    "newsletter": render_newsletter,
}


def render_email_template(template_name: str, context: dict[str, Any]) -> tuple[str, str]:
    renderer = TEMPLATES[template_name]
    return renderer(context)
