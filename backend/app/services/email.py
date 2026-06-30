from app.services.email_service import send_test_email


def send_test_newsletter_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str | None,
) -> None:
    fallback_html = html_content or f"<pre>{text_content or ''}</pre>"
    send_test_email(to_email=to_email, subject=subject, html_content=fallback_html)
