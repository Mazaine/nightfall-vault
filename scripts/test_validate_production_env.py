import os
from pathlib import Path
import shlex
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts/validate_production_env.sh"
BASE = {
    "POSTGRES_DB": "nightfall_vault",
    "POSTGRES_USER": "nightfall_app",
    "POSTGRES_PASSWORD": "Db-Only-Test-Value-2026-Long",
    "DATABASE_URL": "postgresql+psycopg://nightfall_app:Db-Only-Test-Value-2026-Long@postgres:5432/nightfall_vault",
    "REDIS_PASSWORD": "Redis-Only-Test-Value-2026-Long",
    "REDIS_URL": "redis://:Redis-Only-Test-Value-2026-Long@redis:6379/0",
    "SECRET_KEY": "Local-Validator-Test-Only-2026-Aa9-xY7-pQ2-kL8-Zz",
    "BACKEND_CORS_ORIGINS": '["https://vault.test"]',
    "TRUSTED_PROXY_CIDRS": '["172.30.0.10/32"]',
    "APP_FRONTEND_URL": "https://vault.test",
    "APP_BACKEND_URL": "https://vault.test",
    "FRONTEND_BASE_URL": "https://vault.test",
    "VITE_SUPPORT_EMAIL": "support@vault.test",
    "MEDIA_ROOT": "/data/media",
    "MEDIA_URL_PREFIX": "/media",
    "MEDIA_VOLUME_NAME": "nightfall_media_test",
    "DATABASE_VOLUME_NAME": "nightfall_db_test",
    "REDIS_VOLUME_NAME": "nightfall_redis_test",
    "BACKUP_DIRECTORY": "/srv/nightfall/backups",
    "BACKUP_RETENTION_DAYS": "14",
    "OFFSITE_BACKUP_MODE": "disabled",
    "OFFSITE_BACKUP_TARGET": "",
    "ENVIRONMENT": "production",
    "DEVELOPMENT_ADMIN_SEED_ENABLED": "false",
    "EMAIL_DELIVERY_ENABLED": "false",
    "CAPTCHA_ENABLED": "false",
    "ALLOW_PRODUCTION_RESTORE": "NO",
    "NIGHTFALL_IMAGE_TAG": "c25cdc07e80a",
    "HTTP_BIND": "127.0.0.1",
    "HTTP_PORT": "8080",
}


def run(values: dict[str, str]) -> subprocess.CompletedProcess[str]:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as handle:
        for name, value in values.items():
            handle.write(f"{name}={shlex.quote(value)}\n")
        path = Path(handle.name)
    try:
        os.chmod(path, 0o600)
        return subprocess.run(
            ["bash", str(VALIDATOR)],
            cwd=ROOT,
            env={**os.environ, "PRODUCTION_ENV_FILE": str(path)},
            text=True,
            capture_output=True,
            check=False,
        )
    finally:
        path.unlink(missing_ok=True)


valid_result = run(BASE)
assert valid_result.returncode == 0, valid_result.stderr
for name, replacement in (
    ("SECRET_KEY", "CHANGE_ME"),
    ("APP_FRONTEND_URL", "http://vault.test"),
    ("BACKEND_CORS_ORIGINS", '["*"]'),
    ("REDIS_PASSWORD", "short"),
    ("EMAIL_DELIVERY_ENABLED", "true"),
    ("CAPTCHA_ENABLED", "true"),
    ("OFFSITE_BACKUP_MODE", "rclone"),
    ("ALLOW_PRODUCTION_RESTORE", "YES"),
    ("HTTP_BIND", "0.0.0.0"),
):
    candidate = dict(BASE)
    candidate[name] = replacement
    result = run(candidate)
    assert result.returncode != 0, f"{name} hibás értékét a validator elfogadta"
    assert "HIBAK" not in result.stdout

print("A production env validator célzott futási tesztje sikeres.")
