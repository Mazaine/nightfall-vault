from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import ExpiredSignatureError, JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Érvénytelen azonosító token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    expired_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A bejelentkezési token lejárt. Kérlek jelentkezz be újra.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.access_token_algorithm],
        )
        subject = payload.get("sub")
        if subject is None:
            raise credentials_exception
        user_id = int(subject)
    except ExpiredSignatureError:
        raise expired_exception from None
    except (JWTError, ValueError):
        raise credentials_exception from None

    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise credentials_exception

    return user


def require_active_user(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    if not current_user.is_active or current_user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ez a felhasználói fiók inaktív.",
        )
    from app.services.moderation_actions import require_not_fully_banned

    require_not_fully_banned(db, current_user.id)
    return current_user


def require_admin(current_user: User = Depends(require_active_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ehhez a művelethez admin jogosultság szükséges.",
        )
    return current_user


def get_optional_current_user(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.access_token_algorithm],
        )
        subject = payload.get("sub")
        if subject is None:
            return None
        user_id = int(subject)
    except (JWTError, ValueError):
        return None

    user = db.get(User, user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        return None

    return user
