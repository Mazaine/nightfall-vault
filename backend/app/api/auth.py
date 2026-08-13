import hashlib
import logging
import secrets
from urllib.parse import urlencode
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
import httpx
import jwt
from jwt import InvalidTokenError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.security import create_access_token, hash_password, verify_password
from app.crud.user import create_user, get_user_by_email, get_user_by_username
from app.db.session import get_db
from app.dependencies.auth import get_optional_current_user, require_active_user
from app.models.email_verification_token import EmailVerificationToken
from app.models.newsletter import NewsletterSubscriber
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_session import RefreshSession
from app.models.user import User, UserAuthIdentity
from app.schemas.auth import AuthIdentityRead, ForgotPasswordRequest, LoginRequest, MessageResponse, ResendVerificationRequest, ResetPasswordRequest, SocialProviderStatus, SocialStartResponse, TokenResponse
from app.schemas.user import AccountDeleteRequest, NotificationPreferencesRead, NotificationPreferencesUpdate, PasswordChangeRequest, UserCreate, UserMeRead, UserProfileUpdate
from app.services.captcha_service import verify_captcha
from app.services.email_service import send_email_verification_email, send_password_reset_email
from app.services.security_audit import create_login_attempt
from app.services.social_auth import PROVIDERS, authorization_url, exchange_code, provider_configured, safe_username

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)
SOCIAL_STATE_COOKIE = "nightfall_oauth_state"


def _refresh_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.refresh_cookie_name,
        token,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.environment.strip().lower() == "production",
        samesite="lax",
        path="/api/auth",
    )


def _new_refresh_session(db: Session, user: User, request: Request, *, family_id: str | None = None) -> str:
    raw = secrets.token_urlsafe(48)
    db.add(RefreshSession(
        user_id=user.id,
        token_digest=_refresh_digest(raw),
        family_id=family_id or str(uuid4()),
        auth_version=user.auth_version,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    ))
    return raw


def _social_redirect(message: str | None = None, *, target: str = "/login") -> RedirectResponse:
    suffix = f"?{urlencode({'social_error': message})}" if message else ""
    return RedirectResponse(f"{settings.app_frontend_url.rstrip('/')}{target}{suffix}", status_code=303)


def _issue_social_session(db: Session, user: User, request: Request, response: Response) -> None:
    previous = request.cookies.get(settings.refresh_cookie_name)
    if previous:
        session = db.scalar(select(RefreshSession).where(RefreshSession.token_digest == _refresh_digest(previous)))
        if session is not None and session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
    refresh_token = _new_refresh_session(db, user, request)
    db.commit()
    _set_refresh_cookie(response, refresh_token)


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def field_error(field: str, message: str, status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return field_errors({field: message}, status_code=status_code)


def field_errors(errors: dict[str, str], status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "message": "A regisztráció nem sikerült.",
            "errors": errors,
        },
    )


def create_email_verification(db: Session, user: User) -> str:
    now = datetime.now(timezone.utc)
    active_tokens = db.scalars(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
        ),
    ).all()
    for token in active_tokens:
        token.used_at = now
        db.add(token)
    raw_token = secrets.token_urlsafe(32)
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_token),
            expires_at=now + timedelta(hours=24),
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
    verify_captcha(user_create.captcha_token or user_create.turnstile_token, action="register", request=request)

    errors: dict[str, str] = {}
    if get_user_by_email(db, user_create.email) is not None:
        errors["email"] = "Ez az e-mail-cím már regisztrálva van."
    if get_user_by_username(db, user_create.username) is not None:
        errors["username"] = "Ez a felhasználónév már foglalt."
    if user_create.password != user_create.confirm_password:
        errors["confirm_password"] = "A két jelszó nem egyezik."
    if not user_create.accepted_terms:
        errors["accepted_terms"] = "A felhasználási feltételek elfogadása kötelező."
    if not user_create.accepted_privacy:
        errors["accepted_privacy"] = "Az adatkezelési tájékoztató elfogadása kötelező."
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
    return MessageResponse(message="Sikeres regisztráció. Az aktiváló linket elküldtük e-mailben.")


@router.post("/login", response_model=TokenResponse)
def login(
    login_request: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    check_rate_limit(request, "auth:login", settings.login_rate_limit_per_minute, login_request.email)
    verify_captcha(login_request.captcha_token or login_request.turnstile_token, action="login", request=request)

    ip_address = get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    user = get_user_by_email(db, login_request.email)
    if user is None or not user.password_login_enabled or not verify_password(login_request.password, user.password_hash):
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
            detail="Hibás e-mail-cím vagy jelszó.",
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
            detail="Ez a felhasználói fiók inaktív.",
        )

    from app.services.moderation_actions import require_not_fully_banned

    require_not_fully_banned(db, user.id)

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
            detail="A fiók még nincs aktiválva. Ellenőrizd az e-mail-fiókodat.",
        )

    create_login_attempt(
        db,
        email=login_request.email,
        ip_address=ip_address,
        user_agent=user_agent,
        success=True,
    )
    refresh_token = _new_refresh_session(db, user, request)
    db.commit()
    _set_refresh_cookie(response, refresh_token)
    access_token = create_access_token(subject=user.id, session_version=user.auth_version)
    return TokenResponse(access_token=access_token, user=UserMeRead.model_validate(user))


@router.get("/social/providers", response_model=list[SocialProviderStatus])
def social_providers() -> list[SocialProviderStatus]:
    return [SocialProviderStatus(provider=provider, configured=provider_configured(provider)) for provider in PROVIDERS]


@router.post("/social/{provider}/start", response_model=SocialStartResponse)
def start_social_auth(
    provider: str,
    response: Response,
    request: Request,
    link: bool = Query(False),
    current_user: User | None = Depends(get_optional_current_user),
) -> SocialStartResponse:
    if provider not in PROVIDERS or not provider_configured(provider):
        raise HTTPException(status_code=404, detail="Ez a külső bejelentkezési mód jelenleg nem érhető el.")
    if link and current_user is None:
        raise HTTPException(status_code=401, detail="A fiók összekapcsolásához jelentkezz be.")
    check_rate_limit(request, f"auth:social-start:{provider}", settings.login_rate_limit_per_minute, str(current_user.id if current_user else "guest"))
    nonce = secrets.token_urlsafe(24)
    state_id = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    state = jwt.encode({"sid": state_id, "nonce": nonce, "action": "link" if link else "login", "uid": current_user.id if current_user else None, "iat": now, "exp": now + timedelta(minutes=10)}, settings.secret_key, algorithm=settings.access_token_algorithm)
    response.set_cookie(SOCIAL_STATE_COOKIE, state_id, max_age=600, httponly=True, secure=settings.environment.strip().lower() == "production", samesite="none" if settings.environment.strip().lower() == "production" else "lax", path="/api/auth/social")
    return SocialStartResponse(authorization_url=authorization_url(provider, state, nonce))


@router.api_route("/social/{provider}/callback", methods=["GET", "POST"], response_class=RedirectResponse)
async def social_callback(provider: str, request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    values = request.query_params if request.method == "GET" else await request.form()
    code, state = values.get("code"), values.get("state")
    if provider not in PROVIDERS or not isinstance(code, str) or not isinstance(state, str):
        return _social_redirect("A külső bejelentkezés nem sikerült.")
    try:
        claims = jwt.decode(state, settings.secret_key, algorithms=[settings.access_token_algorithm])
        if not secrets.compare_digest(str(claims.get("sid", "")), request.cookies.get(SOCIAL_STATE_COOKIE, "")):
            raise ValueError("state mismatch")
        identity = exchange_code(provider, code, str(claims["nonce"]))
    except (InvalidTokenError, KeyError, ValueError, httpx.HTTPError):
        logger.warning("Social login validation failed provider=%s request_id=%s", provider, getattr(request.state, "request_id", None))
        return _social_redirect(f"A {provider.capitalize()}-bejelentkezés nem sikerült.")

    stored = db.scalar(select(UserAuthIdentity).where(UserAuthIdentity.provider == provider, UserAuthIdentity.provider_subject == identity.subject))
    action, requested_user_id = claims.get("action"), claims.get("uid")
    if action == "link":
        user = db.get(User, requested_user_id) if isinstance(requested_user_id, int) else None
        if user is None or not user.is_active or user.deleted_at is not None:
            return _social_redirect("A fiók összekapcsolása nem sikerült.", target="/account/profile")
        if stored is not None and stored.user_id != user.id:
            return _social_redirect("Ez a külső fiók már egy másik Nightfall Vault-fiókhoz tartozik.", target="/account/profile")
        existing_provider = db.scalar(select(UserAuthIdentity).where(UserAuthIdentity.user_id == user.id, UserAuthIdentity.provider == provider))
        if existing_provider is not None and existing_provider.provider_subject != identity.subject:
            return _social_redirect("Ehhez a szolgáltatóhoz már másik külső fiók van kapcsolva.", target="/account/profile")
        if existing_provider is None:
            db.add(UserAuthIdentity(user_id=user.id, provider=provider, provider_subject=identity.subject, provider_email=identity.email))
            db.commit()
        result = _social_redirect(target=f"/account/profile?social_linked={provider}")
    else:
        if stored is not None:
            user = db.get(User, stored.user_id)
        else:
            user = get_user_by_email(db, identity.email) if identity.email else None
            if user is not None:
                return _social_redirect("Ehhez az e-mail-címhez már tartozik fiók. Jelentkezz be a meglévő fiókoddal az összekapcsoláshoz.")
            if not identity.email or not identity.email_verified:
                return _social_redirect("A szolgáltató nem adott ellenőrzött e-mail-címet. Előbb hozz létre Nightfall Vault-fiókot, majd kapcsold hozzá.")
            username_base = safe_username(identity.email, provider)
            username, counter = username_base, 1
            while get_user_by_username(db, username) is not None:
                counter += 1
                username = f"{username_base[:70]}-{counter}"
            user = User(email=identity.email, username=username, full_name=(identity.display_name or username)[:160], password_hash=hash_password(secrets.token_urlsafe(48)), password_login_enabled=False, is_active=True, is_email_verified=True)
            db.add(user)
            db.flush()
            db.add(UserAuthIdentity(user_id=user.id, provider=provider, provider_subject=identity.subject, provider_email=identity.email))
            db.commit()
        if user is None or not user.is_active or user.deleted_at is not None:
            return _social_redirect("Ez a felhasználói fiók inaktív.")
        from app.services.moderation_actions import require_not_fully_banned
        require_not_fully_banned(db, user.id)
        result = _social_redirect(target="/auth/social/complete")
    result.delete_cookie(SOCIAL_STATE_COOKIE, path="/api/auth/social")
    _issue_social_session(db, user, request, result)
    return result


@router.get("/me/auth-identities", response_model=list[AuthIdentityRead])
def list_auth_identities(current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> list[AuthIdentityRead]:
    return [AuthIdentityRead.model_validate(item, from_attributes=True) for item in db.scalars(select(UserAuthIdentity).where(UserAuthIdentity.user_id == current_user.id).order_by(UserAuthIdentity.provider)).all()]


@router.delete("/me/auth-identities/{provider}", response_model=MessageResponse)
def unlink_auth_identity(provider: str, current_user: User = Depends(require_active_user), db: Session = Depends(get_db)) -> MessageResponse:
    identity = db.scalar(select(UserAuthIdentity).where(UserAuthIdentity.user_id == current_user.id, UserAuthIdentity.provider == provider))
    if identity is None:
        raise HTTPException(status_code=404, detail="Ez a külső fiók nincs összekapcsolva.")
    identity_count = db.scalar(select(func.count(UserAuthIdentity.id)).where(UserAuthIdentity.user_id == current_user.id)) or 0
    if not current_user.password_login_enabled and identity_count <= 1:
        raise HTTPException(status_code=409, detail="Az utolsó biztonságos belépési mód nem választható le.")
    db.delete(identity)
    db.commit()
    return MessageResponse(message="A külső fiók leválasztása sikerült.")


@router.post("/refresh", response_model=TokenResponse)
def refresh_session(request: Request, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    raw = request.cookies.get(settings.refresh_cookie_name)
    if not raw:
        raise HTTPException(status_code=401, detail="A munkamenet megújítása nem lehetséges.")
    session = db.scalar(select(RefreshSession).where(RefreshSession.token_digest == _refresh_digest(raw)).with_for_update())
    now = datetime.now(timezone.utc)
    if session is None:
        response.delete_cookie(settings.refresh_cookie_name, path="/api/auth")
        raise HTTPException(status_code=401, detail="A munkamenet érvénytelen.")
    if session.revoked_at is not None:
        for member in db.scalars(select(RefreshSession).where(RefreshSession.family_id == session.family_id, RefreshSession.revoked_at.is_(None))).all():
            member.revoked_at = now
        db.commit()
        response.delete_cookie(settings.refresh_cookie_name, path="/api/auth")
        raise HTTPException(status_code=401, detail="A munkamenet biztonsági okból megszűnt.")
    expires_at = session.expires_at if session.expires_at.tzinfo else session.expires_at.replace(tzinfo=timezone.utc)
    user = db.get(User, session.user_id)
    if expires_at <= now or user is None or not user.is_active or user.deleted_at is not None or session.auth_version != user.auth_version:
        session.revoked_at = now
        db.commit()
        response.delete_cookie(settings.refresh_cookie_name, path="/api/auth")
        raise HTTPException(status_code=401, detail="A munkamenet lejárt.")
    from app.services.moderation_actions import require_not_fully_banned
    require_not_fully_banned(db, user.id)
    replacement = _new_refresh_session(db, user, request, family_id=session.family_id)
    session.revoked_at = now
    session.last_used_at = now
    session.replaced_by_digest = _refresh_digest(replacement)
    db.commit()
    _set_refresh_cookie(response, replacement)
    return TokenResponse(access_token=create_access_token(subject=user.id, session_version=user.auth_version), user=UserMeRead.model_validate(user))


@router.post("/logout", response_model=MessageResponse)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> MessageResponse:
    raw = request.cookies.get(settings.refresh_cookie_name)
    if raw:
        session = db.scalar(select(RefreshSession).where(RefreshSession.token_digest == _refresh_digest(raw)))
        if session is not None and session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()
    response.delete_cookie(settings.refresh_cookie_name, path="/api/auth")
    return MessageResponse(message="Sikeresen kijelentkeztél.")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    forgot_request: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    check_rate_limit(request, "auth:forgot-password", settings.forgot_password_rate_limit_per_minute, forgot_request.email)
    verify_captcha(forgot_request.captcha_token or forgot_request.turnstile_token, action="forgot-password", request=request)

    user = get_user_by_email(db, forgot_request.email)
    if user is not None and user.is_active:
        now = datetime.now(timezone.utc)
        active_tokens = db.scalars(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
            ),
        ).all()
        for token in active_tokens:
            token.used_at = now
            db.add(token)
        raw_token = secrets.token_urlsafe(32)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_token),
            expires_at=now + timedelta(hours=1),
        )
        db.add(reset_token)
        db.commit()

        reset_url = f"{settings.app_frontend_url.rstrip('/')}/reset-password?token={raw_token}"
        send_password_reset_email(user.email, reset_url)

    return MessageResponse(
        message="Ha létezik ilyen e-mail-című aktív fiók, elküldtük a jelszó-visszaállító linket.",
    )


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(
    resend_request: ResendVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> MessageResponse:
    check_rate_limit(
        request,
        "auth:resend-verification",
        settings.resend_verification_rate_limit_per_minute,
        resend_request.email,
    )
    verify_captcha(resend_request.captcha_token or resend_request.turnstile_token, action="resend-verification", request=request)

    user = get_user_by_email(db, resend_request.email)
    if user is not None and user.is_active and not user.is_email_verified:
        raw_token = create_email_verification(db, user)
        verification_url = f"{settings.app_frontend_url.rstrip('/')}/auth/verify-email?token={raw_token}"
        send_email_verification_email(user.email, verification_url)

    return MessageResponse(
        message="Ha a fiók létezik és még nincs aktiválva, elküldtük az új aktiváló linket.",
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
        raise HTTPException(status_code=400, detail="Érvénytelen vagy már felhasznált jelszó-visszaállító link.")

    expires_at = reset_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=400, detail="A jelszó-visszaállító link lejárt.")

    if reset_request.new_password != reset_request.confirm_password:
        raise HTTPException(status_code=422, detail="Az új jelszó és a megerősítése nem egyezik.")

    user = db.get(User, reset_token.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=400, detail="A jelszó-visszaállítás nem hajtható végre.")

    user.password_hash = hash_password(reset_request.new_password)
    user.password_login_enabled = True
    user.auth_version += 1
    user_tokens = db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ),
    ).all()
    for token in user_tokens:
        token.used_at = now
        db.add(token)
    db.add(user)
    db.add(reset_token)
    db.commit()
    return MessageResponse(message="A jelszavad sikeresen módosult. Most már bejelentkezhetsz.")


@router.get("/verify-email", response_model=MessageResponse)
def verify_email(token: str, db: Session = Depends(get_db)) -> MessageResponse:
    token_hash = hash_reset_token(token)
    verification = db.scalar(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash),
    )
    now = datetime.now(timezone.utc)
    if verification is None or verification.used_at is not None:
        raise HTTPException(status_code=400, detail="Érvénytelen vagy már felhasznált aktiváló link.")

    expires_at = verification.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=400, detail="Az aktiváló link lejárt.")

    user = db.get(User, verification.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=400, detail="A fiók aktiválása nem hajtható végre.")

    user.is_email_verified = True
    verification.used_at = now
    db.add(user)
    db.add(verification)
    db.commit()
    return MessageResponse(message="A fiókod sikeresen aktiválva lett. Most már bejelentkezhetsz.")


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
    email_changed = False
    if profile_update.email is not None and profile_update.email != current_user.email:
        existing_user = get_user_by_email(db, profile_update.email)
        if existing_user is not None and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ez az e-mail-cím már regisztrálva van.",
            )
        current_user.email = profile_update.email
        current_user.is_email_verified = False
        email_changed = True

    if profile_update.username is not None and profile_update.username != current_user.username:
        existing_user = get_user_by_username(db, profile_update.username)
        if existing_user is not None and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ez a felhasználónév már foglalt.",
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
    if email_changed:
        raw_token = create_email_verification(db, current_user)
        verification_url = f"{settings.app_frontend_url.rstrip('/')}/auth/verify-email?token={raw_token}"
        send_email_verification_email(current_user.email, verification_url)
    return UserMeRead.model_validate(current_user)


@router.patch("/me/password", response_model=MessageResponse)
def change_my_password(
    password_change: PasswordChangeRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(password_change.current_password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="A jelenlegi jelszó nem megfelelő.")

    if password_change.new_password != password_change.confirm_password:
        raise HTTPException(status_code=422, detail="Az új jelszó és a megerősítése nem egyezik.")

    if verify_password(password_change.new_password, current_user.password_hash):
        raise HTTPException(status_code=422, detail="Az új jelszó nem lehet azonos a jelenlegi jelszóval.")

    current_user.password_hash = hash_password(password_change.new_password)
    current_user.password_login_enabled = True
    current_user.auth_version += 1
    db.add(current_user)
    db.commit()
    return MessageResponse(message="A jelszavad sikeresen módosult.")


@router.delete("/me", response_model=MessageResponse)
def delete_me(
    delete_request: AccountDeleteRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(delete_request.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="A megadott jelszó nem megfelelő.")

    current_user.is_active = False
    current_user.auth_version += 1
    current_user.deleted_at = datetime.now(timezone.utc)
    current_user.email = f"deleted-{current_user.id}-{current_user.email}"
    current_user.username = f"deleted-{current_user.id}-{current_user.username}"
    current_user.full_name = f"Törölt felhasználó #{current_user.id}"
    subscriber = db.scalar(select(NewsletterSubscriber).where(NewsletterSubscriber.user_id == current_user.id))
    if subscriber is not None:
        subscriber.is_active = False
        subscriber.unsubscribed_at = current_user.deleted_at
        db.add(subscriber)
    db.add(current_user)
    db.commit()
    return MessageResponse(message="A fiókod törlésre került.")
