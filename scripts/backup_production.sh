#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
load_production_env
require_command docker
require_command sha256sum
[[ "$BACKUP_DIRECTORY" == /* && "$BACKUP_DIRECTORY" != "/" ]] || die "A BACKUP_DIRECTORY abszolút, nem gyökér Linux-útvonal legyen."
[[ "${BACKUP_RETENTION_DAYS:-14}" =~ ^[0-9]+$ ]] || die "A BACKUP_RETENTION_DAYS csak nemnegatív egész lehet."

mkdir -p "$BACKUP_DIRECTORY"
require_free_space_mb "$BACKUP_DIRECTORY" "${BACKUP_MIN_FREE_MB:-1024}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIRECTORY/$stamp"
work="$BACKUP_DIRECTORY/.${stamp}.partial"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"

log "Adatbázis- és média-mentés készül."
compose exec -T postgres pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$work/database.dump"
docker_raw run --rm -v "${MEDIA_VOLUME_NAME}:/source:ro" -v "$work:/backup" alpine:3.20 tar -C /source -czf /backup/media.tar.gz .
revision="$(compose exec -T postgres psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select version_num from alembic_version limit 1')"
commit="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || printf unknown)"
users_count="$(compose exec -T postgres psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select count(*) from users')"
auctions_count="$(compose exec -T postgres psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select count(*) from auctions')"
media_sample="$(docker_raw run --rm -v "${MEDIA_VOLUME_NAME}:/source:ro" alpine:3.20 sh -c 'file="$(find /source -type f -print -quit)"; if [ -n "$file" ]; then printf "%s|%s\n" "${file#/source/}" "$(sha256sum "$file" | cut -d" " -f1)"; else printf "none|none\n"; fi')"
media_sample_path="${media_sample%%|*}"
media_sample_sha256="${media_sample#*|}"
(cd "$work" && sha256sum database.dump media.tar.gz > SHA256SUMS)
cat > "$work/manifest.txt" <<EOF
format=nightfall-backup-v1
created_utc=$stamp
git_commit=$commit
alembic_revision=$revision
database_bytes=$(wc -c < "$work/database.dump")
media_bytes=$(wc -c < "$work/media.tar.gz")
users_count=$users_count
auctions_count=$auctions_count
media_sample_path=$media_sample_path
media_sample_sha256=$media_sample_sha256
EOF
mv "$work" "$final"
trap - EXIT
find "$BACKUP_DIRECTORY" -mindepth 1 -maxdepth 1 -type d -mtime "+${BACKUP_RETENTION_DAYS:-14}" -name '20*' -exec rm -rf -- {} +

case "${OFFSITE_BACKUP_MODE:-disabled}" in
  disabled) ;;
  rclone) require_command rclone; [[ -n "${OFFSITE_BACKUP_TARGET:-}" ]] || die "Hiányzó OFFSITE_BACKUP_TARGET."; rclone copy "$final" "$OFFSITE_BACKUP_TARGET/$stamp" ;;
  rsync) require_command rsync; [[ -n "${OFFSITE_BACKUP_TARGET:-}" ]] || die "Hiányzó OFFSITE_BACKUP_TARGET."; rsync -a -- "$final/" "$OFFSITE_BACKUP_TARGET/$stamp/" ;;
  *) die "Ismeretlen OFFSITE_BACKUP_MODE." ;;
esac
log "A mentés elkészült: $final"
printf '%s\n' "$final"
