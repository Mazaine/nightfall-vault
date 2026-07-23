#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"

mode="${1:-}"
[[ "$mode" == local-preflight || "$mode" == production-postdeploy ]] || die "Használat: release_gate.sh local-preflight|production-postdeploy"
require_command docker
require_command git
load_production_env
"$ROOT_DIR/scripts/validate_production_env.sh"

python_bin="python3"
if ! command -v "$python_bin" >/dev/null 2>&1; then
  if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]] && command -v python >/dev/null 2>&1; then
    python_bin="python"
  else
    die "A Python 3 futtatókörnyezet nem érhető el."
  fi
fi

if [[ "$mode" == local-preflight ]]; then
  require_clean_worktree
  commit="$(git -C "$ROOT_DIR" rev-parse --verify HEAD)"
  [[ -n "$commit" ]] || die "A Git commit nem azonosítható."
  compose config --quiet
  "$ROOT_DIR/scripts/secret_scan.sh"
  git -C "$ROOT_DIR" diff --check
  "$python_bin" "$ROOT_DIR/scripts/test_production_contract.py"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$ROOT_DIR:/work" -w /work nightfall-vault-backend python scripts/test_validate_production_env.py

  dev_compose_file="$ROOT_DIR/docker-compose.yml"
  dev_env_file="$ROOT_DIR/.env"
  if command -v cygpath >/dev/null 2>&1; then
    dev_compose_file="$(cygpath -w "$dev_compose_file")"
    dev_env_file="$(cygpath -w "$dev_env_file")"
  fi
  dev_compose() {
    env \
      -u COMPOSE_PROJECT_NAME -u PROJECT_NAME -u DATABASE_URL -u TEST_DATABASE_URL \
      -u SECRET_KEY -u REDIS_URL -u ENVIRONMENT -u RATE_LIMIT_BACKEND \
      -u CAPTCHA_PROVIDER -u CAPTCHA_ENABLED -u TURNSTILE_SECRET_KEY \
      -u BREVO_API_KEY -u ORDER_ADMIN_EMAIL -u MEDIA_URL_PREFIX \
      -u TRANSACTION_REVIEW_WINDOW_DAYS -u MODERATION_STRIKE_ALERT_THRESHOLD \
      -u AUCTION_SCHEDULER_MODE -u AUCTION_SCHEDULER_INTERVAL_SECONDS \
      -u AUCTION_SCHEDULER_HEARTBEAT_TTL_SECONDS -u LOG_LEVEL -u LOG_FORMAT \
      -u POSTGRES_DB -u POSTGRES_TEST_DB -u POSTGRES_USER -u POSTGRES_PASSWORD \
      -u VITE_API_BASE_URL -u VITE_CAPTCHA_PROVIDER -u VITE_CAPTCHA_ENABLED \
      -u VITE_CAPTCHA_SITE_KEY -u VITE_TURNSTILE_SITE_KEY \
      docker compose --env-file "$dev_env_file" -p nightfall-vault -f "$dev_compose_file" "$@"
  }

  test_media_volume="nightfall-release-gate-test-media-$$"
  docker_raw volume create "$test_media_volume" >/dev/null
  cleanup_test_media() {
    docker_raw volume rm -f "$test_media_volume" >/dev/null 2>&1 || true
  }
  trap cleanup_test_media EXIT

  dev_compose up -d postgres postgres-test redis backend auction-scheduler
  MSYS_NO_PATHCONV=1 dev_compose run --rm -v "$test_media_volume:/data/media" backend pytest -q
  cleanup_test_media
  trap - EXIT

  dev_compose run --rm frontend npm test -- --run
  dev_compose run --rm frontend npm run build
  compose build
  docker run --rm --add-host backend:127.0.0.1 --add-host frontend:127.0.0.1 "nightfall-vault-proxy:${NIGHTFALL_IMAGE_TAG}" nginx -t
  dev_compose exec -T backend alembic current

  media_audit="$(dev_compose exec -T backend python -m app.scripts.audit_media)"
  printf '%s\n' "$media_audit"
  grep -q '"orphan_files": \[\]' <<<"$media_audit" || die "A médiaaudit árva fájlt talált."
  grep -q '"missing_files": \[\]' <<<"$media_audit" || die "A médiaaudit hiányzó adatbázis-hivatkozást talált."

  [[ -x "$ROOT_DIR/scripts/backup_production.sh" && -x "$ROOT_DIR/scripts/restore_smoke_test.sh" ]] || die "A backup vagy restore-smoke script nem végrehajtható."
  log "A local-preflight release gate sikeres (commit: $commit)."
  exit 0
fi

compose config --quiet
running="$(compose ps --services --filter status=running | wc -l | tr -d ' ')"
[[ "$running" -ge 6 ]] || die "Nem fut minden kötelező production szolgáltatás."
"$ROOT_DIR/scripts/smoke_test_production.sh"
compose exec -T backend alembic current
compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping' | grep -q PONG || die "Redis PONG hiányzik."
compose exec -T auction-scheduler python -m app.workers.healthcheck

media_audit="$(compose exec -T backend python -m app.scripts.audit_media)"
printf '%s\n' "$media_audit"
grep -q '"orphan_files": \[\]' <<<"$media_audit" || die "A médiaaudit árva fájlt talált."
grep -q '"missing_files": \[\]' <<<"$media_audit" || die "A médiaaudit hiányzó adatbázis-hivatkozást talált."

latest_backup="$(find "$BACKUP_DIRECTORY" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime -2 -print -quit)"
[[ -n "$latest_backup" ]] || die "Nincs 48 óránál frissebb production backup."
log "A production-postdeploy release gate sikeres."
