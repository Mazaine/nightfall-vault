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
        subject="Webshop Template email test",
        html_content=(
            "<h1>Webshop Template test email</h1>"
            "<p>A Brevo transactional email integr??ci?? megfelel??en m??k??dik.</p>"
        ),
    )
    return TestEmailResponse(message="A teszt emailt sikeresen elk??ldt??k.")


