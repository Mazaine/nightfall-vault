#!/usr/bin/env bash
set -Eeuo pipefail
backup="${1:-}"
[[ -d "$backup" ]] || { echo "Használat: restore_smoke_test.sh BACKUP_KÖNYVTÁR" >&2; exit 1; }
(cd "$backup" && sha256sum -c SHA256SUMS)
grep -q '^format=nightfall-backup-v1$' "$backup/manifest.txt" || { echo "Ismeretlen backup-formátum." >&2; exit 1; }

id="nightfall-restore-smoke-$$"
db_volume="${id}-db"
media_volume="${id}-media"
password="restore-smoke-only-$$"
cleanup() {
  docker rm -f "$id" >/dev/null 2>&1 || true
  docker volume rm "$db_volume" "$media_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$db_volume" >/dev/null
docker volume create "$media_volume" >/dev/null
docker run -d --name "$id" -e POSTGRES_DB=nightfall_restore -e POSTGRES_USER=nightfall_restore -e POSTGRES_PASSWORD="$password" -v "$db_volume:/var/lib/postgresql/data" postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  docker exec "$id" pg_isready -U nightfall_restore -d nightfall_restore >/dev/null 2>&1 && break
  [[ $attempt -lt 30 ]] || { echo "Az izolált PostgreSQL nem indult el." >&2; exit 1; }
  sleep 1
done
docker exec -i "$id" pg_restore --exit-on-error --no-owner -U nightfall_restore -d nightfall_restore < "$backup/database.dump"
revision="$(docker exec "$id" psql -At -U nightfall_restore -d nightfall_restore -c 'select version_num from alembic_version limit 1')"
[[ -n "$revision" ]] || { echo "Az Alembic-verzió nem állt helyre." >&2; exit 1; }
docker run --rm -v "$media_volume:/target" -v "$backup:/backup:ro" alpine:3.20 tar -C /target -xzf /backup/media.tar.gz
docker run --rm -v "$media_volume:/target:ro" alpine:3.20 sh -c 'find /target -type f -print -quit' >/dev/null
printf 'Izolált restore smoke teszt sikeres (Alembic: %s).\n' "$revision"
