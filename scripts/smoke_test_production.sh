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
for path in / /robots.txt /sitemap.xml /nightfall-vault-logo.png; do
  curl --fail --silent --show-error --max-time 5 "$base$path" >/dev/null || die "Nem érhető el: $path"
done
status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$base/egy-biztosan-nem-letezo-oldal")"
[[ "$status" == 200 ]] || die "Az SPA 404 útvonal nem tölthető be ($status)."

headers="$(curl --fail --silent --show-error --head --max-time 5 "$base/")"
grep -qi '^x-content-type-options: nosniff' <<<"$headers" || die "Hiányzik az X-Content-Type-Options fejléc."
grep -qi '^content-security-policy:' <<<"$headers" || die "Hiányzik a Content-Security-Policy fejléc."
grep -qi '^x-frame-options: deny' <<<"$headers" || die "Hiányzik az X-Frame-Options fejléc."

for path in /docs /redoc /openapi.json /health/metrics; do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$base$path")"
  [[ "$status" == 404 ]] || die "Productionben tiltott felület érhető el: $path ($status)."
done
grep -q 'Disallow: /account' < <(curl --fail --silent "$base/robots.txt") || die "Az account robots tiltása hiányzik."
grep -q 'Disallow: /admin' < <(curl --fail --silent "$base/robots.txt") || die "Az admin robots tiltása hiányzik."

status="$(curl --silent --output /dev/null --write-out '%{http_code}' --path-as-is "$base/media/../.env")"
[[ "$status" =~ ^(400|403|404)$ ]] || die "A média traversal-próbája nem lett elutasítva ($status)."

sse_headers="$(curl --silent --show-error --max-time 3 -D - -o /dev/null "$base/api/auctions/realtime/stream" || true)"
grep -qi '^content-type: text/event-stream' <<<"$sse_headers" || die "Az SSE content type hibás."
grep -qi '^x-accel-buffering: no' <<<"$sse_headers" || die "Az SSE proxy buffering tiltása hiányzik."
log "A production smoke teszt sikeres."
