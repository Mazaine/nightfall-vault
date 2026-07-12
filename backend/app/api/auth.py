import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.security import create_access_token, hash_password, verify_password
from app.crud.user import create_user, get_user_by_email, get_user_by_username
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.models.email_verification_token import EmailVerificationToken
from app.models.newsletter import NewsletterSubscriber
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.schemas.auth import ForgotPasswordRequest, LoginRequest, MessageResponse, ResetPasswordRequest, TokenResponse
from app.schemas.user import AccountDeleteRequest, NotificationPreferencesRead, NotificationPreferencesUpdate, PasswordChangeRequest, UserCreate, UserMeRead, UserProfileUpdate
from app.services.captcha_service import verify_captcha
from app.services.email_service import send_email_verification_email, send_password_reset_email
from app.services.security_audit import create_login_attempt

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def field_error(field: str, message: str, status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return field_errors({field: message}, status_code=status_code)


def field_errors(errors: dict[str, str], status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "message": "A regisztrĂˇciĂł nem sikerĂĽlt.",
            "errors": errors,
        },
    )


def create_email_verification(db: Session, user: User) -> str:
    raw_token = secrets.token_urlsafe(32)
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        ),
    )
    db.commit()
    return raw_token


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register(
    user_create: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    check_rate_limit(request, "auth:register", settings.register_rate_limit_per_minute, user_create.email)
    verify_captcha(user_create.captcha_token or user_create.turnstile_token, action="register")

    errors: dict[str, str] = {}
    if get_user_by_email(db, user_create.email) is not None:
        errors["email"] = "Ez az e-mail cĂ­m mĂˇr regisztrĂˇlva van."
    if get_user_by_username(db, user_create.username) is not None:
        errors["username"] = "Ez a felhasznĂˇlĂłnĂ©v mĂˇr foglalt."
    if user_create.password != user_create.confirm_password:
        errors["confirm_password"] = "A kĂ©t jelszĂł nem egyezik."
    if not user_create.accepted_terms:
        errors["accepted_terms"] = "Az ĂSZF elfogadĂˇsa kĂ¶telezĹ‘."
    if not user_create.accepted_privacy:
        errors["accepted_privacy"] = "Az adatkezelĂ©si tĂˇjĂ©koztatĂł elfogadĂˇsa kĂ¶telezĹ‘."
    if errors:
        raise field_errors(errors)

    user = create_user(
        db=db,
        user_create=user_create,
        password_hash=hash_password(user_create.password),
    )
    if user_create.subscribed_newsletter:
        db.add(
            NewsletterSubscriber(
                email=user.email,
                full_name=user.full_name,
                user_id=user.id,
                is_active=True,
                source="registration",
            ),
        )
        db.commit()

    raw_token = create_email_verification(db, user)
    verification_url = f"{settings.app_frontend_url.rstrip('/')}/auth/verify-email?token={raw_token}"
    send_email_verification_email(user.email, verification_url)
    return MessageResponse(message="Sikeres regisztrĂˇciĂł. Az aktivĂˇlĂł linket elkĂĽldtĂĽk e-mailben.")


@router.post("/login", response_model=TokenResponse)
def login(
    login_request: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    check_rate_limit(request, "auth:login", settings.login_rate_limit_per_minute, login_request.email)
    verify_captcha(login_request.captcha_token or login_request.turnstile_token, action="login")

    ip_address = get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    user = get_user_by_email(db, login_request.email)
    if user is None or not verify_password(login_request.password, user.password_hash):
        create_login_attempt(
            db,
            email=login_request.email,
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            failure_reason="invalid_credentials",
        )
        db.commit()
        logger.warning("Failed login reason=invalid_credentials ip=%s request_id=%s", ip_address, getattr(request.state, "request_id", None))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        create_login_attempt(
            db,
            email=login_request.email,
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            failure_reason="inactive_user",
        )
        db.commit()
        logger.warning("Failed login reason=inactive_user user_id=%s ip=%s request_id=%s", user.id, ip_address, getattr(request.state, "request_id", None))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    if not user.is_email_verified:
        create_login_attempt(
            db,
            email=login_request.email,
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            failure_reason="email_not_verified",
        )
        db.commit()
        logger.warning("Failed login reason=email_not_verified user_id=%s ip=%s request_id=%s", user.id, ip_address, getattr(request.state, "request_id", None))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A fiok meg nincs aktivalva.",
        )

    create_login_attempt(
        db,
        email=login_request.email,
        ip_address=ip_address,
        user_agent=user_agent,
        success=True,
    )
    db.commit()
    access_token = create_access_token(subject=user.id)
    return TokenResponse(access_token=access_token, user=UserMeRead.model_validate(user))


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    forgot_request: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    check_rate_limit(request, "auth:forgot-password", settings.forgot_password_rate_limit_per_minute, forgot_request.email)
    verify_captcha(forgot_request.captcha_token or forgot_request.turnstile_token, action="forgot-password")

    user = get_user_by_email(db, forgot_request.email)
    if user is not None and user.is_active:
        raw_token = secrets.token_urlsafe(32)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(reset_token)
        db.commit()

        reset_url = f"{settings.app_frontend_url.rstrip('/')}/reset-password?token={raw_token}"
        send_password_reset_email(user.email, reset_url)

    return MessageResponse(
        message="Ha lĂ©tezik ilyen email cĂ­mĹ± aktĂ­v fiĂłk, elkĂĽldtĂĽk a jelszĂł-visszaĂˇllĂ­tĂł linket.",
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    reset_request: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    token_hash = hash_reset_token(reset_request.token)
    reset_token = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash),
    )
    now = datetime.now(timezone.utc)
    if reset_token is None or reset_token.used_at is not None:
        raise HTTPException(status_code=400, detail="Ă‰rvĂ©nytelen vagy mĂˇr felhasznĂˇlt jelszĂł-visszaĂˇllĂ­tĂł link.")

    expires_at = reset_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=400, detail="A jelszĂł-visszaĂˇllĂ­tĂł link lejĂˇrt.")

    if len(reset_request.new_password) < 8:
        raise HTTPException(status_code=422, detail="Az Ăşj jelszĂłnak legalĂˇbb 8 karakter hosszĂşnak kell lennie.")

    user = db.get(User, reset_token.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=400, detail="A jelszĂł-visszaĂˇllĂ­tĂˇs nem hajthatĂł vĂ©gre.")

    user.password_hash = hash_password(reset_request.new_password)
    reset_token.used_at = now
    db.add(user)
    db.add(reset_token)
    db.commit()
    return MessageResponse(message="A jelszavad sikeresen mĂłdosult. Most mĂˇr bejelentkezhetsz.")


@router.get("/verify-email", response_model=MessageResponse)
def verify_email(token: str, db: Session = Depends(get_db)) -> MessageResponse:
    token_hash = hash_reset_token(token)
    verification = db.scalar(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash),
    )
    now = datetime.now(timezone.utc)
    if verification is None or verification.used_at is not None:
        raise HTTPException(status_code=400, detail="Ă‰rvĂ©nytelen vagy mĂˇr felhasznĂˇlt aktivĂˇlĂł link.")

    expires_at = verification.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=400, detail="Az aktivĂˇlĂł link lejĂˇrt.")

    user = db.get(User, verification.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=400, detail="A fiĂłk aktivĂˇlĂˇsa nem hajthatĂł vĂ©gre.")

    user.is_email_verified = True
    verification.used_at = now
    db.add(user)
    db.add(verification)
    db.commit()
    return MessageResponse(message="A fiĂłkod sikeresen aktivĂˇlva lett. Most mĂˇr bejelentkezhetsz.")


@router.get("/me", response_model=UserMeRead)
def get_me(current_user: User = Depends(require_active_user)) -> UserMeRead:
    return UserMeRead.model_validate(current_user)


@router.get("/me/notification-preferences", response_model=NotificationPreferencesRead)
def get_notification_preferences(current_user: User = Depends(require_active_user)) -> NotificationPreferencesRead:
    return NotificationPreferencesRead.model_validate(current_user)


@router.put("/me/notification-preferences", response_model=NotificationPreferencesRead)
def update_notification_preferences(
    preferences: NotificationPreferencesUpdate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> NotificationPreferencesRead:
    for field_name, value in preferences.model_dump().items():
        setattr(current_user, field_name, value)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return NotificationPreferencesRead.model_validate(current_user)


@router.patch("/me", response_model=UserMeRead)
def update_me(
    profile_update: UserProfileUpdate,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> UserMeRead:
    if profile_update.email is not None and profile_update.email != current_user.email:
        existing_user = get_user_by_email(db, profile_update.email)
        if existing_user is not None and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )
        current_user.email = profile_update.email
        current_user.is_email_verified = False

    if profile_update.username is not None and profile_update.username != current_user.username:
        existing_user = get_user_by_username(db, profile_update.username)
        if existing_user is not None and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already registered",
            )
        current_user.username = profile_update.username

    if profile_update.full_name is not None:
        current_user.full_name = profile_update.full_name

    subscriber = db.scalar(
        select(NewsletterSubscriber).where(NewsletterSubscriber.user_id == current_user.id),
    )
    if subscriber is not None:
        subscriber.email = current_user.email
        subscriber.full_name = current_user.full_name

    db.commit()
    db.refresh(current_user)
    return UserMeRead.model_validate(current_user)


@router.patch("/me/password", response_model=MessageResponse)
def change_my_password(
    password_change: PasswordChangeRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(password_change.current_password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="A jelenlegi jelszĂł nem megfelelĹ‘.")

    if password_change.new_password != password_change.confirm_password:
        raise HTTPException(status_code=422, detail="Az Ăşj jelszĂł Ă©s a megerĹ‘sĂ­tĂ©s nem egyezik.")

    if verify_password(password_change.new_password, current_user.password_hash):
        raise HTTPException(status_code=422, detail="Az Ăşj jelszĂł nem lehet azonos a jelenlegi jelszĂłval.")

    current_user.password_hash = hash_password(password_change.new_password)
    db.add(current_user)
    db.commit()
    return MessageResponse(message="A jelszavad sikeresen mĂłdosult.")


@router.delete("/me", response_model=MessageResponse)
def delete_me(
    delete_request: AccountDeleteRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(delete_request.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="A megadott jelszĂł nem megfelelĹ‘.")

    current_user.is_active = False
    current_user.deleted_at = datetime.now(timezone.utc)
    current_user.email = f"deleted-{current_user.id}-{current_user.email}"
    current_user.username = f"deleted-{current_user.id}-{current_user.username}"
    current_user.full_name = f"TĂ¶rĂ¶lt felhasznĂˇlĂł #{current_user.id}"
    subscriber = db.scalar(select(NewsletterSubscriber).where(NewsletterSubscriber.user_id == current_user.id))
    if subscriber is not None:
        subscriber.is_active = False
        subscriber.unsubscribed_at = current_user.deleted_at
        db.add(subscriber)
    db.add(current_user)
    db.commit()
    return MessageResponse(message="A fiĂłkod tĂ¶rlĂ©sre kerĂĽlt.")
