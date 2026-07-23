#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
backup="${1:-}"
[[ -d "$backup" ]] || { echo "Használat: restore_smoke_test.sh BACKUP_KÖNYVTÁR" >&2; exit 1; }
(cd "$backup" && sha256sum -c SHA256SUMS)
grep -q '^format=nightfall-backup-v1$' "$backup/manifest.txt" || { echo "Ismeretlen backup-formátum." >&2; exit 1; }

manifest_value() { sed -n "s/^$1=//p" "$backup/manifest.txt" | head -n1; }
expected_revision="$(manifest_value alembic_revision)"
expected_users="$(manifest_value users_count)"
expected_auctions="$(manifest_value auctions_count)"
sample_path="$(manifest_value media_sample_path)"
sample_hash="$(manifest_value media_sample_sha256)"
[[ -n "$expected_revision" && "$expected_users" =~ ^[0-9]+$ && "$expected_auctions" =~ ^[0-9]+$ ]] || {
  echo "A manifestből hiányzik a revision vagy a rekordszám." >&2; exit 1;
}

id="nightfall-restore-smoke-$$"
db_volume="${id}-db"
media_volume="${id}-media"
password="restore-smoke-only-$$"
cleanup() {
  docker rm -f "$id" >/dev/null 2>&1 || true
  docker volume rm "$db_volume" "$media_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker_raw volume create "$db_volume" >/dev/null
docker_raw volume create "$media_volume" >/dev/null
docker_raw run -d --name "$id" -e POSTGRES_DB=nightfall_restore -e POSTGRES_USER=nightfall_restore -e POSTGRES_PASSWORD="$password" -v "$db_volume:/var/lib/postgresql/data" postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  docker exec "$id" pg_isready -h 127.0.0.1 -U nightfall_restore -d nightfall_restore >/dev/null 2>&1 && break
  [[ $attempt -lt 30 ]] || { echo "Az izolált PostgreSQL nem indult el." >&2; exit 1; }
  sleep 1
done
docker exec -i "$id" pg_restore --exit-on-error --no-owner -h 127.0.0.1 -U nightfall_restore -d nightfall_restore < "$backup/database.dump"
revision="$(docker exec "$id" psql -At -h 127.0.0.1 -U nightfall_restore -d nightfall_restore -c 'select version_num from alembic_version limit 1')"
users="$(docker exec "$id" psql -At -h 127.0.0.1 -U nightfall_restore -d nightfall_restore -c 'select count(*) from users')"
auctions="$(docker exec "$id" psql -At -h 127.0.0.1 -U nightfall_restore -d nightfall_restore -c 'select count(*) from auctions')"
[[ "$revision" == "$expected_revision" ]] || { echo "Az Alembic revision eltér a manifesttől." >&2; exit 1; }
[[ "$users" == "$expected_users" && "$auctions" == "$expected_auctions" ]] || { echo "A visszaállított alapvető rekordszámok eltérnek." >&2; exit 1; }

docker_raw run --rm -v "$media_volume:/target" -v "$backup:/backup:ro" alpine:3.20 tar -C /target -xzf /backup/media.tar.gz
if [[ "$sample_path" != none ]]; then
  restored_hash="$(docker_raw run --rm -v "$media_volume:/target:ro" alpine:3.20 sha256sum "/target/$sample_path" | cut -d' ' -f1)"
  [[ "$restored_hash" == "$sample_hash" ]] || { echo "A mintamédia hash-ellenőrzése sikertelen." >&2; exit 1; }
fi
printf 'Izolált restore smoke sikeres (Alembic: %s, users: %s, auctions: %s).\n' "$revision" "$users" "$auctions"
