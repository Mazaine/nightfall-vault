#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
load_production_env
backup="${1:-}"
[[ -d "$backup" && "${2:-}" == --confirm-data-loss ]] || die "Használat: restore_production.sh BACKUP_KÖNYVTÁR --confirm-data-loss"
[[ "${ALLOW_PRODUCTION_RESTORE:-}" == YES ]] || die "Állítsd ALLOW_PRODUCTION_RESTORE=YES értékre a tudatos jóváhagyáshoz."
(cd "$backup" && sha256sum -c SHA256SUMS)
grep -q '^format=nightfall-backup-v1$' "$backup/manifest.txt" || die "Ismeretlen backup-formátum."
log "Biztonsági mentés készül a visszaállítás előtt."
"$ROOT_DIR/scripts/backup_production.sh"
compose stop backend auction-scheduler reverse-proxy
compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
compose exec -T postgres pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$backup/database.dump"
docker run --rm -v "${MEDIA_VOLUME_NAME}:/target" -v "$backup:/backup:ro" alpine:3.20 sh -c 'find /target -mindepth 1 -delete && tar -C /target -xzf /backup/media.tar.gz'
compose up -d
"$ROOT_DIR/scripts/smoke_test_production.sh"
log "A visszaállítás és az ellenőrzés sikeres."
