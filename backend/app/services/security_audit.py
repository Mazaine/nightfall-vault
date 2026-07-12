from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import get_client_ip
from app.models.security_log import AuditLog, LoginAttempt


def create_login_attempt(
    db: Session,
    *,
    email: str,
    ip_address: str | None,
    user_agent: str | None,
    success: bool,
    failure_reason: str | None = None,
) -> LoginAttempt:
    attempt = LoginAttempt(
        email=email.lower(),
        ip_address=ip_address,
        user_agent=user_agent,
        success=success,
        failure_reason=failure_reason,
    )
    db.add(attempt)
    return attempt


def get_user_id_from_authorization_header(authorization: str | None) -> int | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.access_token_algorithm])
        subject = payload.get("sub")
        return int(subject) if subject is not None else None
    except (JWTError, ValueError):
        return None


def create_admin_audit_log(db: Session, request, status_code: int | None) -> AuditLog:
    log = AuditLog(
        user_id=get_user_id_from_authorization_header(request.headers.get("authorization")),
        action=f"{request.method} {request.url.path}",
        path=request.url.path,
        method=request.method,
        status_code=status_code,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        metadata_json={"query": str(request.url.query) if request.url.query else None},
    )
    db.add(log)
    return log


def create_domain_audit_log(
    db: Session,
    *,
    action: str,
    user_id: int | None = None,
    auction_id: int | None = None,
    metadata: dict | None = None,
) -> AuditLog:
    log = AuditLog(
        user_id=user_id,
        auction_id=auction_id,
        action=action,
        path="domain",
        method="SYSTEM",
        status_code=None,
        ip_address=None,
        user_agent=None,
        metadata_json=metadata,
    )
    db.add(log)
    return log
