from fastapi import APIRouter, Depends

from app.dependencies.auth import require_admin
from app.models.user import User
from app.schemas.test_email import TestEmailRequest, TestEmailResponse
from app.services.email_service import send_test_email

router = APIRouter(prefix="/api/test-email", tags=["test-email"])


@router.post("", response_model=TestEmailResponse)
def send_brevo_test_email(
    request: TestEmailRequest,
    _current_user: User = Depends(require_admin),
) -> TestEmailResponse:
    send_test_email(
        to_email=str(request.email),
        subject="Nightfall Vault – e-mail-küldési próba",
        html_content=(
            "<h1>Nightfall Vault e-mail-próba</h1>"
            "<p>A Brevo tranzakciós e-mail integráció megfelelően működik.</p>"
        ),
    )
    return TestEmailResponse(message="A teszt e-mail küldését elindítottuk.")

