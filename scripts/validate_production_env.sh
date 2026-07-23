#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
PYTHON_BIN=python3
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1 && [[ "$(uname -s)" == MINGW* ]]; then
  PYTHON_BIN=python
fi
require_command "$PYTHON_BIN"
load_production_env

required=(
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL
  REDIS_PASSWORD REDIS_URL SECRET_KEY BACKEND_CORS_ORIGINS TRUSTED_PROXY_CIDRS
  APP_FRONTEND_URL APP_BACKEND_URL FRONTEND_BASE_URL VITE_SUPPORT_EMAIL
  MEDIA_ROOT MEDIA_URL_PREFIX MEDIA_VOLUME_NAME DATABASE_VOLUME_NAME REDIS_VOLUME_NAME
  BACKUP_DIRECTORY BACKUP_RETENTION_DAYS OFFSITE_BACKUP_MODE
  ENVIRONMENT DEVELOPMENT_ADMIN_SEED_ENABLED EMAIL_DELIVERY_ENABLED CAPTCHA_ENABLED NIGHTFALL_IMAGE_TAG
  HTTP_BIND HTTP_PORT
)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || die "Hiányzó vagy üres kötelező változó: $name"
done

MSYS2_ARG_CONV_EXCL='*' MSYS2_ENV_CONV_EXCL='MEDIA_ROOT;BACKUP_DIRECTORY' "$PYTHON_BIN" - <<'PY'
import ipaddress
import json
import os
import re
import sys
from urllib.parse import urlparse

def fail(name: str, message: str) -> None:
    print(f"[nightfall] HIBA: {name}: {message}", file=sys.stderr)
    raise SystemExit(1)

def value(name: str) -> str:
    return os.environ.get(name, "").strip()

placeholders = ("CHANGE_ME", "example.invalid", "example.com", "changeme", "password123", "secret123")
for name, current in os.environ.items():
    if name in {
        "POSTGRES_PASSWORD", "DATABASE_URL", "REDIS_PASSWORD", "REDIS_URL", "SECRET_KEY",
        "BACKEND_CORS_ORIGINS", "TRUSTED_PROXY_CIDRS", "APP_FRONTEND_URL",
        "APP_BACKEND_URL", "FRONTEND_BASE_URL", "VITE_SUPPORT_EMAIL", "SMTP_PASSWORD",
        "BREVO_API_KEY", "TURNSTILE_SECRET_KEY", "VITE_CAPTCHA_SITE_KEY", "OFFSITE_BACKUP_TARGET",
        "NIGHTFALL_IMAGE_TAG",
    } and any(marker.lower() in current.lower() for marker in placeholders):
        fail(name, "tiltott minta- vagy gyenge példaértéket tartalmaz")

if value("ENVIRONMENT").lower() != "production":
    fail("ENVIRONMENT", "production érték szükséges")
if value("DEVELOPMENT_ADMIN_SEED_ENABLED").lower() not in {"false", "0", "no"}:
    fail("DEVELOPMENT_ADMIN_SEED_ENABLED", "productionben tiltott")
if value("NIGHTFALL_IMAGE_TAG").lower() in {"local", "latest"} or not re.fullmatch(r"[0-9a-f]{7,40}", value("NIGHTFALL_IMAGE_TAG")):
    fail("NIGHTFALL_IMAGE_TAG", "7–40 karakteres Git commit hash szükséges")
if value("HTTP_BIND") not in {"127.0.0.1", "::1"}:
    fail("HTTP_BIND", "a belső reverse proxy portja csak loopbackre köthető")
if not value("HTTP_PORT").isdigit() or not 1024 <= int(value("HTTP_PORT")) <= 65535:
    fail("HTTP_PORT", "1024 és 65535 közötti port szükséges")
if len(value("SECRET_KEY")) < 48:
    fail("SECRET_KEY", "legalább 48 karakter szükséges")
if len(set(value("SECRET_KEY"))) < 12:
    fail("SECRET_KEY", "túl alacsony entrópiájú")

for name in ("APP_FRONTEND_URL", "APP_BACKEND_URL", "FRONTEND_BASE_URL"):
    parsed = urlparse(value(name))
    if parsed.scheme != "https" or not parsed.hostname:
        fail(name, "érvényes HTTPS URL szükséges")
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        fail(name, "localhost nem használható publikus production URL-ként")

try:
    origins = json.loads(value("BACKEND_CORS_ORIGINS"))
except json.JSONDecodeError:
    fail("BACKEND_CORS_ORIGINS", "érvényes JSON-lista szükséges")
if not isinstance(origins, list) or not origins:
    fail("BACKEND_CORS_ORIGINS", "legalább egy origin szükséges")
for origin in origins:
    parsed = urlparse(str(origin))
    if origin == "*" or parsed.scheme != "https" or parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        fail("BACKEND_CORS_ORIGINS", "csak konkrét HTTPS origin engedélyezett")

try:
    proxies = json.loads(value("TRUSTED_PROXY_CIDRS"))
except json.JSONDecodeError:
    fail("TRUSTED_PROXY_CIDRS", "érvényes JSON-lista szükséges")
if not isinstance(proxies, list) or not proxies:
    fail("TRUSTED_PROXY_CIDRS", "legalább egy konkrét proxy CIDR szükséges")
for proxy in proxies:
    try:
        network = ipaddress.ip_network(proxy, strict=False)
    except ValueError:
        fail("TRUSTED_PROXY_CIDRS", "hibás CIDR")
    if network.num_addresses > 256:
        fail("TRUSTED_PROXY_CIDRS", "túl tág hálózat; legfeljebb 256 cím engedélyezett")

email = value("VITE_SUPPORT_EMAIL")
if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
    fail("VITE_SUPPORT_EMAIL", "érvényes támogatási e-mail-cím szükséges")

database = urlparse(value("DATABASE_URL").replace("postgresql+psycopg://", "postgresql://", 1))
if database.scheme != "postgresql" or database.hostname != "postgres" or not database.username or not database.password or not database.path.strip("/"):
    fail("DATABASE_URL", "postgres szolgáltatásra mutató, hitelesített PostgreSQL URL szükséges")
redis = urlparse(value("REDIS_URL"))
if redis.scheme not in {"redis", "rediss"} or redis.hostname != "redis" or not redis.password:
    fail("REDIS_URL", "redis szolgáltatásra mutató, jelszavas Redis URL szükséges")
if len(value("REDIS_PASSWORD")) < 24:
    fail("REDIS_PASSWORD", "legalább 24 karakter szükséges")
if len(value("POSTGRES_PASSWORD")) < 24:
    fail("POSTGRES_PASSWORD", "legalább 24 karakter szükséges")

media_root = value("MEDIA_ROOT")
if not media_root.startswith("/") or media_root == "/" or ".." in media_root.split("/"):
    fail("MEDIA_ROOT", "abszolút, biztonságos Linux-útvonal szükséges")
backup_root = value("BACKUP_DIRECTORY")
if not backup_root.startswith("/") or backup_root == "/":
    fail("BACKUP_DIRECTORY", "abszolút, nem gyökér Linux-útvonal szükséges")
if not value("BACKUP_RETENTION_DAYS").isdigit() or int(value("BACKUP_RETENTION_DAYS")) < 1:
    fail("BACKUP_RETENTION_DAYS", "legalább 1 nap szükséges")

email_enabled = value("EMAIL_DELIVERY_ENABLED").lower() in {"true", "1", "yes"}
if email_enabled:
    brevo = bool(value("BREVO_API_KEY") and value("BREVO_SENDER_EMAIL"))
    smtp = bool(value("SMTP_HOST") and value("SMTP_USER") and value("SMTP_PASSWORD") and value("SMTP_FROM_EMAIL"))
    if not (brevo or smtp):
        fail("EMAIL_DELIVERY_ENABLED", "engedélyezve van, de nincs teljes Brevo- vagy SMTP-konfiguráció")

captcha_enabled = value("CAPTCHA_ENABLED").lower() in {"true", "1", "yes"}
if captcha_enabled and not (value("TURNSTILE_SECRET_KEY") and value("VITE_CAPTCHA_SITE_KEY")):
    fail("CAPTCHA_ENABLED", "engedélyezve van, de hiányzik a privát vagy publikus Turnstile-kulcs")

offsite = value("OFFSITE_BACKUP_MODE")
if offsite not in {"disabled", "rclone", "rsync"}:
    fail("OFFSITE_BACKUP_MODE", "csak disabled, rclone vagy rsync lehet")
if offsite != "disabled" and not value("OFFSITE_BACKUP_TARGET"):
    fail("OFFSITE_BACKUP_TARGET", "off-site mentésnél kötelező")
if value("ALLOW_PRODUCTION_RESTORE").upper() not in {"", "NO"}:
    fail("ALLOW_PRODUCTION_RESTORE", "alapállapotban NO vagy üres legyen")
PY

if [[ "$(uname -s)" != MINGW* ]]; then
  mode="$(stat -c '%a' "$PRODUCTION_ENV_FILE")"
  (( 10#$mode <= 640 )) || die "PRODUCTION_ENV_FILE: a jogosultság túl tág ($mode); használj 600 vagy 640 módot"
fi
log "A production konfiguráció minden ellenőrzése sikeres."
