from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt
from passlib.context import CryptContext

from app.core.config import settings

password_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated=["bcrypt"])


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return password_context.verify(plain_password, password_hash)


def create_access_token(
    subject: str | int,
    expires_delta: timedelta | None = None,
    session_version: int = 0,
) -> str:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": issued_at,
        "exp": expires_at,
        "ver": session_version,
        "jti": uuid4().hex,
    }
    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.access_token_algorithm,
    )
