"""Create or update a local development admin user from environment variables.

The script is blocked in production and never contains a default password.
Required environment variables:
- DEV_ADMIN_EMAIL
- DEV_ADMIN_PASSWORD

Optional environment variables:
- DEV_ADMIN_USERNAME
- DEV_ADMIN_FULL_NAME
"""

import os

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User
from sqlalchemy import select


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def seed_dev_admin() -> None:
    if settings.environment.lower() == "production":
        raise RuntimeError("Refusing to seed a development admin in production.")

    admin_email = _require_env("DEV_ADMIN_EMAIL")
    admin_password = _require_env("DEV_ADMIN_PASSWORD")
    admin_username = os.getenv("DEV_ADMIN_USERNAME", "dev-admin").strip() or "dev-admin"
    admin_full_name = os.getenv("DEV_ADMIN_FULL_NAME", "Development Admin").strip() or "Development Admin"

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == admin_email))
        if user is None:
            user = User(
                email=admin_email,
                username=admin_username,
                full_name=admin_full_name,
                password_hash=hash_password(admin_password),
                role="admin",
                is_active=True,
                is_email_verified=True,
            )
            db.add(user)
        else:
            user.username = admin_username
            user.full_name = admin_full_name
            user.password_hash = hash_password(admin_password)
            user.role = "admin"
            user.is_active = True
            user.is_email_verified = True
            user.deleted_at = None
            db.add(user)
        db.commit()
        print(f"Development admin ready: {admin_email}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_dev_admin()
