import logging
from email.message import EmailMessage
import smtplib

import httpx

from app.core.config import settings
from app.models.order import Order
from app.models.user import User
from app.services.email_templates import render_email_template

logger = logging.getLogger(__name__)


def _sender() -> dict[str, str]:
    return {"email": settings.brevo_sender_email or settings.smtp_from_email or "dev@example.local", "name": settings.brevo_sender_name or settings.smtp_from_name}


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    if settings.brevo_api_key and settings.brevo_sender_email:
        payload = {
            "sender": _sender(),
            "to": [{"email": to_email}],
            "subject": subject.replace("\r", "").replace("\n", " ")[:180],
            "htmlContent": html_content,
        }
        try:
            response = httpx.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": settings.brevo_api_key, "content-type": "application/json"},
                json=payload,
                timeout=10,
            )
            if response.status_code >= 400:
                logger.error("Brevo email failed with status=%s subject=%s", response.status_code, subject)
                return False
            return True
        except Exception:
            logger.exception("Brevo email send failed subject=%s", subject)
            return False
    if not settings.smtp_host or not settings.smtp_from_email:
        logger.info("Email skipped because SMTP is not configured: %s", subject)
        return False
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message.set_content(html_content, subtype="html")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        smtp.starttls()
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
    return True


def send_test_email(to_email: str, subject: str, html_content: str) -> bool:
    return send_email(to_email, subject, html_content)


def send_order_created_email(order: Order) -> bool:
    subject, html_content = render_email_template("order_created", {"order": order})
    return send_email(order.customer_email, subject, html_content)


def send_order_admin_notification_email(order: Order) -> bool:
    if not settings.order_admin_email:
        return False
    subject, html_content = render_email_template("order_admin_notification", {"order": order})
    return send_email(settings.order_admin_email, subject, html_content)


def send_order_completed_email(order: Order) -> bool:
    subject, html_content = render_email_template("order_completed", {"order": order})
    return send_email(order.customer_email, subject, html_content)


def send_password_reset_email(user: User | str, reset_url: str) -> bool:
    email = user.email if isinstance(user, User) else user
    subject, html_content = render_email_template("password_reset", {"user": user, "reset_url": reset_url})
    return send_email(email, subject, html_content)


def send_email_verification_email(user: User | str, verification_url: str) -> bool:
    email = user.email if isinstance(user, User) else user
    subject, html_content = render_email_template("email_verification", {"user": user, "verification_url": verification_url})
    return send_email(email, subject, html_content)


def send_newsletter_email(to_email: str, subject: str, content_html: str) -> bool:
    rendered_subject, html_content = render_email_template("newsletter", {"subject": subject, "content_html": content_html})
    return send_email(to_email, rendered_subject, html_content)
