#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
load_production_env
require_command docker
require_command sha256sum
[[ -n "${ROLLBACK_IMAGE_TAG:-}" ]] || die "Add meg a korábban elkészített ROLLBACK_IMAGE_TAG értéket."
[[ "$ROLLBACK_IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]] || die "Érvénytelen image tag."

current_tag="${NIGHTFALL_IMAGE_TAG:-unknown}"
log "Jelenlegi image tag: $current_tag"
log "Cél image tag: $ROLLBACK_IMAGE_TAG"
for image in backend frontend proxy; do
  docker image inspect "nightfall-vault-${image}:$ROLLBACK_IMAGE_TAG" >/dev/null 2>&1 || die "Hiányzó rollback image: nightfall-vault-${image}:$ROLLBACK_IMAGE_TAG"
done

if [[ "${ROLLBACK_CONFIRM:-}" != YES ]]; then
  [[ -t 0 ]] || die "Nem interaktív futtatásnál ROLLBACK_CONFIRM=YES szükséges."
  read -r -p "Biztosan visszaállsz a(z) $ROLLBACK_IMAGE_TAG image tagre? Írd be: ROLLBACK " answer
  [[ "$answer" == ROLLBACK ]] || die "A rollback megszakítva."
fi

state_dir="${BACKUP_DIRECTORY}/rollback-state"
mkdir -p "$state_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cat > "$state_dir/$stamp.txt" <<EOF
created_utc=$stamp
current_image_tag=$current_tag
target_image_tag=$ROLLBACK_IMAGE_TAG
current_git_commit=$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || printf unknown)
compose_sha256=$(sha256sum "$PRODUCTION_COMPOSE_FILE" | cut -d' ' -f1)
EOF

export NIGHTFALL_IMAGE_TAG="$ROLLBACK_IMAGE_TAG"
compose config --quiet
compose up -d --no-build backend auction-scheduler frontend reverse-proxy
"$ROOT_DIR/scripts/smoke_test_production.sh"
log "Alkalmazás-rollback kész. Adatbázis downgrade nem futott; inkompatibilis migrációnál ellenőrzött backup restore szükséges."
