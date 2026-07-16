#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
require_command docker
require_command curl
load_production_env
"$ROOT_DIR/scripts/validate_production_env.sh"
require_clean_worktree
require_free_space_mb "$ROOT_DIR" "${DEPLOY_MIN_FREE_MB:-2048}"

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
compose run --rm backend alembic upgrade head
compose up -d --remove-orphans
"$ROOT_DIR/scripts/smoke_test_production.sh"
log "A production deploy sikeresen lezárult."
