#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "$0")" && pwd)/lib/production_common.sh"
load_production_env
base="${SMOKE_BASE_URL:-http://127.0.0.1:${HTTP_PORT:-8080}}"

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 "$base/health/ready" >/tmp/nightfall-ready.json; then break; fi
  [[ $attempt -lt 30 ]] || die "A readiness végpont nem állt fel időben."
  sleep 2
done
curl --fail --silent --show-error --max-time 5 "$base/" >/dev/null
headers="$(curl --fail --silent --show-error --head --max-time 5 "$base/")"
grep -qi '^x-content-type-options: nosniff' <<<"$headers" || die "Hiányzik az X-Content-Type-Options fejléc."
grep -qi '^content-security-policy:' <<<"$headers" || die "Hiányzik a Content-Security-Policy fejléc."
status="$(curl --silent --output /dev/null --write-out '%{http_code}' --path-as-is "$base/media/../.env")"
[[ "$status" =~ ^(400|403|404)$ ]] || die "A média útvonal traversal-próbája nem lett elutasítva ($status)."
log "A production smoke teszt sikeres."
