"""Explicit, audited production administrator bootstrap CLI."""

import argparse
from getpass import getpass
import re

from sqlalchemy import or_, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User
from app.services.security_audit import create_domain_audit_log


def validate_admin_password(password: str) -> None:
    if len(password) < 14 or not all((
        re.search(r"[a-z]", password),
        re.search(r"[A-Z]", password),
        re.search(r"\d", password),
        re.search(r"[^A-Za-z0-9]", password),
    )):
        raise ValueError("Az adminjelszó legalább 14 karakteres, kis- és nagybetűt, számot és jelet tartalmazó érték legyen.")


def create_or_promote_admin(*, email: str, username: str, full_name: str, password: str | None, promote_existing: bool) -> User:
    if settings.environment.lower() != "production":
        raise RuntimeError("Ez a CLI kizárólag ENVIRONMENT=production környezetben használható.")
    normalized_email = email.strip().lower()
    normalized_username = username.strip()
    normalized_name = " ".join(full_name.strip().split())
    if not normalized_email or "@" not in normalized_email or len(normalized_username) < 3 or len(normalized_name) < 2:
        raise ValueError("Érvényes e-mail, legalább 3 karakteres felhasználónév és teljes név szükséges.")

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(or_(User.email == normalized_email, User.username == normalized_username)))
        if existing:
            if not promote_existing:
                raise RuntimeError("A felhasználó már létezik; módosítás nem történt. Tudatos előléptetéshez használd a --promote-existing kapcsolót.")
            if existing.email != normalized_email or existing.username != normalized_username:
                raise RuntimeError("Az e-mail és a felhasználónév különböző meglévő fiókokkal ütközik.")
            if existing.deleted_at is not None or not existing.is_active or not existing.is_email_verified:
                raise RuntimeError("Törölt, inaktív vagy nem megerősített fiók nem léptethető elő.")
            if existing.role == "admin":
                return existing
            existing.role = "admin"
            create_domain_audit_log(db, action="production_admin_promoted", user_id=existing.id, metadata={"source": "operator_cli"})
            db.commit()
            db.refresh(existing)
            return existing

        if password is None:
            raise ValueError("Új admin létrehozásához jelszó szükséges.")
        validate_admin_password(password)
        user = User(
            email=normalized_email,
            username=normalized_username,
            full_name=normalized_name,
            password_hash=hash_password(password),
            role="admin",
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        db.flush()
        create_domain_audit_log(db, action="production_admin_created", user_id=user.id, metadata={"source": "operator_cli"})
        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Nightfall Vault production admin létrehozása vagy tudatos előléptetése.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--promote-existing", action="store_true")
    args = parser.parse_args()
    password = None
    if not args.promote_existing:
        password = getpass("Új admin jelszava: ")
        if password != getpass("Jelszó ismét: "):
            raise SystemExit("A két jelszó nem egyezik.")
    user = create_or_promote_admin(
        email=args.email, username=args.username, full_name=args.full_name,
        password=password, promote_existing=args.promote_existing,
    )
    print(f"Production admin kész (azonosító: {user.id}, felhasználónév: {user.username}).")


if __name__ == "__main__":
    main()
