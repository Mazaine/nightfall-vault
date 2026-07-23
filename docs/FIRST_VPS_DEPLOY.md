# Első Rackhost Ubuntu VPS deploy runbook

Alapértelmezett cél: Ubuntu 24.04 LTS, Nginx reverse proxy + Let's Encrypt. A parancsokat **nem** futtatta a Codex; az operátor a VPS-en, ellenőrzött domainnel hajtja végre.

## 1. Szerver előkészítése

1. Frissítés: `sudo apt update && sudo apt full-upgrade -y`.
2. Deploy user: `sudo adduser --disabled-password --gecos "" nightfall`; SSH public key a `/home/nightfall/.ssh/authorized_keys` fájlba, helyes tulajdon/jogosultságokkal.
3. Csak az új kulcsos belépés külön terminálon történt ellenőrzése után javasolt az SSH-ban `PermitRootLogin no` és `PasswordAuthentication no`, majd `sudo systemctl reload ssh`.
4. Időzóna: `sudo timedatectl set-timezone Europe/Budapest`.
5. UFW: először `sudo ufw allow OpenSSH`, majd `sudo ufw allow 80/tcp`, `sudo ufw allow 443/tcp`, végül `sudo ufw enable`. PostgreSQL, Redis, backend és frontend port nem nyitható.
6. Telepítsd a Docker Engine és Compose plugint a Docker hivatalos Ubuntu tárolójából; továbbá `git curl ca-certificates openssl nginx certbot python3-certbot-nginx`. Ellenőrzés: `docker version`, `docker compose version`.
7. `sudo usermod -aG docker nightfall`; új session után ellenőrizd a Docker elérést.
8. Könyvtárak: `sudo install -d -o nightfall -g nightfall -m 750 /srv/nightfall-vault /srv/nightfall-vault/backups`.

## 2. Repository és konfiguráció

1. `git clone REPOSITORY_URL /srv/nightfall-vault/app`; `cd /srv/nightfall-vault/app`.
2. Válaszd ki az auditált commitot/taget, majd `git checkout COMMIT_HASH`.
3. `git status --porcelain` kimenete legyen üres; `git rev-parse HEAD` egyezzen a jóváhagyott commit hashével.
4. `cp .env.production.example .env.production && chmod 600 .env.production`.
5. Töltsd ki a `docs/PRODUCTION_ENV_CHECKLIST.md` alapján. `NIGHTFALL_IMAGE_TAG=$(git rev-parse --short=12 HEAD)`.
6. Első kötelező ellenőrzés: `PRODUCTION_ENV_FILE=.env.production ./scripts/validate_production_env.sh`.

## 3. Első build és adatbázis

1. `docker compose --env-file .env.production -f docker-compose.production.yml config --quiet`.
2. `docker compose --env-file .env.production -f docker-compose.production.yml build --pull backend frontend reverse-proxy`.
3. `docker compose --env-file .env.production -f docker-compose.production.yml up -d postgres redis`.
4. Várd meg a healthy állapotot; Redis: `docker compose --env-file .env.production -f docker-compose.production.yml exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping'`.
5. Migráció: `docker compose --env-file .env.production -f docker-compose.production.yml run --rm backend alembic upgrade head`.
6. Ellenőrzés: ugyanígy `run --rm backend alembic current`; eredmény: `0014_realtime_notifications (head)`. Downgrade nem fut.

## 4. Alkalmazásindítás

1. `docker compose --env-file .env.production -f docker-compose.production.yml up -d media-init`; sikeres befejezés ellenőrzése.
2. `docker compose --env-file .env.production -f docker-compose.production.yml up -d backend auction-scheduler frontend reverse-proxy`.
3. `docker compose --env-file .env.production -f docker-compose.production.yml ps`: minden tartós szolgáltatás healthy.
4. A konténer proxy csak `127.0.0.1:8080` címen érhető el. `PRODUCTION_ENV_FILE=.env.production ./scripts/smoke_test_production.sh`.

## 5. Első admin

Nincs automatikus vagy beégetett production admin. Új admin interaktív jelszóval:

`docker compose --env-file .env.production -f docker-compose.production.yml run --rm backend python -m app.scripts.create_production_admin --email ADMIN_EMAIL --username ADMIN_USERNAME --full-name "ADMIN TELJES NÉV"`

Már létező, aktív és megerősített fiók tudatos előléptetése:

`docker compose --env-file .env.production -f docker-compose.production.yml run --rm backend python -m app.scripts.create_production_admin --email EMAIL --username USERNAME --full-name "TELJES NÉV" --promote-existing`

Konfliktusnál a CLI módosítás nélkül leáll; a művelet auditnaplóba kerül.

## 6. Első smoke és release gate

A smoke ellenőrzi a kezdőlapot, robots/sitemap/favicon/SPA 404-et, health/readiness-t, security headereket, traversal-tiltást, OpenAPI/docs és publikus metrics tiltását, valamint SSE content type/buffering állapotot.

TLS aktiválás és az első sikeres backup után:

`PRODUCTION_ENV_FILE=.env.production SMOKE_BASE_URL=https://VALODI_DOMAIN ./scripts/release_gate.sh production-postdeploy`

Siker: minden szolgáltatás fut, readiness/smoke/Alembic/Redis/scheduler/storage/médiaaudit rendben és van 48 óránál frissebb backup.

## 7. Standard későbbi deploy

`PRODUCTION_ENV_FILE=.env.production ./scripts/deploy_production.sh`

Ez tiszta munkafát és szabad helyet kér, renderel/buildel, meglévő séma esetén előzetes backupot készít, csak előre migrál, indít, majd smoke tesztet futtat. Hiba esetén állj meg; ne futtass kézi downgrade-ot.
