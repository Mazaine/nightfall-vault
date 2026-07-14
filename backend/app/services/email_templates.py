from typing import Any
import html


def base_layout(title: str, body: str) -> str:
    return f"""
    <!doctype html>
    <html lang="hu">
      <body style="margin:0;background:#050509;color:#f3ead7;font-family:Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;color:transparent;">{html.escape(title)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050509;padding:28px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #36264a;border-radius:12px;background:#12111a;overflow:hidden;">
              <tr><td style="padding:26px 30px;border-bottom:1px solid #2b2138;text-align:center;">
                <div style="color:#f1d58a;font-size:12px;letter-spacing:3px;text-transform:uppercase;">Nightfall Vault</div>
                <div style="margin-top:8px;color:#c084fc;font-size:13px;letter-spacing:1px;">Aukciós közösség</div>
              </td></tr>
              <tr><td style="padding:32px 30px;">
                <h1 style="margin:0 0 20px;color:#fffaf0;font-family:Georgia,serif;font-size:30px;line-height:1.2;">{html.escape(title)}</h1>
                {body}
              </td></tr>
              <tr><td style="padding:20px 30px;border-top:1px solid #2b2138;color:#91869f;font-size:12px;line-height:1.6;">
                Ezt a biztonsági üzenetet a Nightfall Vault küldte. Ha nem te kezdeményezted a műveletet, az e-mailt figyelmen kívül hagyhatod.
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
    """


def action_button(url: str, label: str) -> str:
    safe_url = html.escape(url, quote=True)
    safe_label = html.escape(label)
    return (
        f'<p style="margin:28px 0;"><a href="{safe_url}" '
        'style="display:inline-block;border:1px solid #c084fc;border-radius:8px;background:#6d28d9;color:#fffaf0;'
        f'font-weight:700;text-decoration:none;padding:14px 22px;">{safe_label}</a></p>'
        '<p style="margin:22px 0 6px;color:#bdb2c7;font-size:13px;">Ha a gomb nem működik, másold a böngésződbe ezt a linket:</p>'
        f'<p style="margin:0;word-break:break-all;"><a href="{safe_url}" style="color:#c084fc;">{safe_url}</a></p>'
    )


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
    reset_url = str(context["reset_url"])
    body = (
        '<p style="color:#f3ead7;line-height:1.7;">Jelszó-visszaállítást kértél a Nightfall Vault-fiókodhoz.</p>'
        + action_button(reset_url, "Új jelszó beállítása")
        + '<p style="margin-top:24px;color:#f1d58a;font-size:13px;line-height:1.6;">A link 1 óráig érvényes és csak egyszer használható.</p>'
    )
    return "Nightfall Vault – jelszó-visszaállítás", base_layout("Új jelszó beállítása", body)


def render_email_verification(context: dict[str, Any]) -> tuple[str, str]:
    verification_url = str(context["verification_url"])
    body = (
        '<p style="color:#f3ead7;line-height:1.7;">Köszönjük a regisztrációt. Erősítsd meg az e-mail-címedet, hogy beléphess és részt vehess az aukciókon.</p>'
        + action_button(verification_url, "Fiók aktiválása")
        + '<p style="margin-top:24px;color:#f1d58a;font-size:13px;line-height:1.6;">Az aktiváló link 24 óráig érvényes és csak egyszer használható.</p>'
    )
    return "Nightfall Vault – fiókaktiválás", base_layout("Aktiváld a fiókodat", body)


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
