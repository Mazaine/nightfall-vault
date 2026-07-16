#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRODUCTION_ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT_DIR/.env.production}"
PRODUCTION_COMPOSE_FILE="${PRODUCTION_COMPOSE_FILE:-$ROOT_DIR/docker-compose.production.yml}"

log() { printf '[nightfall] %s\n' "$*"; }
die() { printf '[nightfall] HIBA: %s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "Hiányzó parancs: $1"; }

load_production_env() {
  [[ -f "$PRODUCTION_ENV_FILE" ]] || die "Hiányzó production env fájl: $PRODUCTION_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$PRODUCTION_ENV_FILE"
  set +a
}

compose() {
  docker compose --env-file "$PRODUCTION_ENV_FILE" -f "$PRODUCTION_COMPOSE_FILE" "$@"
}

require_clean_worktree() {
  [[ -z "$(git -C "$ROOT_DIR" status --porcelain)" ]] || die "A Git munkafa nem tiszta. Deploy előtt commitold vagy tedd félre a módosításokat."
}

require_free_space_mb() {
  local path="$1" minimum="$2" available
  available="$(df -Pm "$path" | awk 'NR==2 {print $4}')"
  [[ "$available" =~ ^[0-9]+$ && "$available" -ge "$minimum" ]] || die "Nincs legalább ${minimum} MB szabad hely itt: $path"
}
