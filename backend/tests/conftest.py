"""Global pytest safety guard and isolated test database bootstrap."""

import os
from urllib.parse import urlparse


def _database_name(url: str) -> str:
    normalized = url.replace("postgresql+psycopg://", "postgresql://", 1)
    return urlparse(normalized).path.lstrip("/")


def _activate_test_database() -> None:
    development_url = os.getenv("DATABASE_URL", "").strip()
    test_url = os.getenv("TEST_DATABASE_URL", "").strip()

    if not test_url:
        raise RuntimeError("TEST_DATABASE_URL is required before pytest can start.")
    if not development_url:
        raise RuntimeError("DATABASE_URL is required so pytest can verify isolation.")
    if test_url == development_url:
        raise RuntimeError("Refusing to run pytest: TEST_DATABASE_URL equals DATABASE_URL.")
    if not _database_name(test_url).endswith("_test"):
        raise RuntimeError(
            "Refusing to run pytest: the TEST_DATABASE_URL database name must end with '_test'."
        )

    os.environ["DATABASE_URL"] = test_url
    os.environ["ENVIRONMENT"] = "test"


_activate_test_database()


def pytest_sessionstart(session) -> None:
    """Create the current schema only after the test database guard has passed."""
    import app.models  # noqa: F401
    from sqlalchemy import text

    from app.db.base import Base
    from app.db.session import engine

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) PRIMARY KEY)"))
        connection.execute(
            text("INSERT INTO alembic_version (version_num) VALUES ('test_metadata') ON CONFLICT DO NOTHING")
        )
