#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
load_production_env

required=(POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL REDIS_PASSWORD REDIS_URL SECRET_KEY BACKEND_CORS_ORIGINS TRUSTED_PROXY_CIDRS APP_FRONTEND_URL APP_BACKEND_URL FRONTEND_BASE_URL MEDIA_VOLUME_NAME DATABASE_VOLUME_NAME REDIS_VOLUME_NAME BACKUP_DIRECTORY)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || die "Hiányzó kötelező változó: $name"
done

while IFS= read -r name; do
  value="${!name:-}"
  [[ "$value" != *CHANGE_ME* && "$value" != *example.invalid* ]] || die "$name még mintaértéket tartalmaz."
done < <(printf '%s\n' POSTGRES_PASSWORD DATABASE_URL REDIS_PASSWORD REDIS_URL SECRET_KEY BACKEND_CORS_ORIGINS APP_FRONTEND_URL APP_BACKEND_URL FRONTEND_BASE_URL)

[[ ${#SECRET_KEY} -ge 32 ]] || die "A SECRET_KEY legalább 32 karakter legyen."
[[ "$APP_FRONTEND_URL" == https://* && "$APP_BACKEND_URL" == https://* && "$FRONTEND_BASE_URL" == https://* ]] || die "A publikus URL-eknek HTTPS-t kell használniuk."
[[ "${ENVIRONMENT:-}" == production ]] || die "ENVIRONMENT=production szükséges."
[[ "${DEVELOPMENT_ADMIN_SEED_ENABLED:-false}" == false ]] || die "A fejlesztői admin seed productionben tiltott."
[[ "$BACKUP_DIRECTORY" == /* && "$BACKUP_DIRECTORY" != "/" ]] || die "A BACKUP_DIRECTORY abszolút, nem gyökér Linux-útvonal legyen."
[[ "$BACKEND_CORS_ORIGINS" != *localhost* && "$BACKEND_CORS_ORIGINS" != *'"*"*' ]] || die "A CORS-lista nem tartalmazhat localhostot vagy wildcardot."
if [[ "$(uname -s)" != MINGW* ]]; then
  mode="$(stat -c '%a' "$PRODUCTION_ENV_FILE")"
  (( 10#$mode <= 640 )) || die "Az env fájl jogosultsága túl tág ($mode); használj 600 vagy 640 módot."
fi
log "A production konfiguráció alapellenőrzése sikeres."
