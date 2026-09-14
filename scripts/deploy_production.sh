#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
require_command docker
require_command curl
load_production_env
"$ROOT_DIR/scripts/validate_production_env.sh"
require_clean_worktree
require_free_space_mb "$ROOT_DIR" "${DEPLOY_MIN_FREE_MB:-2048}"

migration_services=(backend auction-scheduler notification-outbox)
services_to_restart=()
apps_stopped=false

restart_previous_apps_on_error() {
  local exit_code=$?
  trap - ERR
  if [[ "$apps_stopped" == true && ${#services_to_restart[@]} -gt 0 ]]; then
    log "A migráció vagy az alkalmazásindítás hibás volt; a korábbi konténerek visszaindítása."
    compose start "${services_to_restart[@]}" || log "FIGYELEM: a korábbi alkalmazáskonténerek automatikus visszaindítása nem sikerült."
  fi
  exit "$exit_code"
}

log "Compose-konfiguráció és image-ek ellenőrzése."
compose config --quiet
compose build --pull
compose up -d postgres redis
has_schema="$(compose exec -T postgres psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select to_regclass('public.alembic_version') is not null")"
if [[ "$has_schema" == t ]]; then
  "$ROOT_DIR/scripts/backup_production.sh"
else
  log "Első telepítés: még nincs migrált adatbázisséma, ezért nincs menthető korábbi állapot."
fi

running_services="$(compose ps --services --filter status=running)"
for service in "${migration_services[@]}"; do
  if grep -Fxq "$service" <<<"$running_services"; then
    services_to_restart+=("$service")
  fi
done

trap restart_previous_apps_on_error ERR
if [[ ${#services_to_restart[@]} -gt 0 ]]; then
  log "Adatbázist használó alkalmazásfolyamatok leállítása a migrációs zárak előtt: ${services_to_restart[*]}"
  apps_stopped=true
  compose stop --timeout "${DEPLOY_STOP_TIMEOUT_SECONDS:-30}" "${services_to_restart[@]}"
fi

log "Adatbázis-migráció futtatása korlátozott zárolási várakozással."
compose run --rm -e "PGOPTIONS=-c lock_timeout=${MIGRATION_LOCK_TIMEOUT:-30s}" backend alembic upgrade head
compose up -d --remove-orphans
apps_stopped=false
trap - ERR
"$ROOT_DIR/scripts/smoke_test_production.sh"
log "A production deploy sikeresen lezárult."
