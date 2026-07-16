#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
load_production_env
[[ -n "${ROLLBACK_IMAGE_TAG:-}" ]] || die "Add meg a korábban elkészített ROLLBACK_IMAGE_TAG értéket."
[[ "$ROLLBACK_IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]] || die "Érvénytelen image tag."
export NIGHTFALL_IMAGE_TAG="$ROLLBACK_IMAGE_TAG"
compose config --quiet
compose up -d --no-build backend auction-scheduler frontend reverse-proxy
"$ROOT_DIR/scripts/smoke_test_production.sh"
log "Alkalmazás-rollback kész. Adatbázis downgrade nem futott automatikusan."
