# Nightfall Vault - Sprint 6 Report

Datum: 2026-07-12
Statusz: elkeszult, restore validacios technikai blokkoloval
Verzio: v0.6.0-dev

## Cel

Sprint 6 celja az eles uzemeltetesi felkeszites erositesese volt: health/readiness, request ID, audit log hozzaferes, media feldolgozas, email csatorna, backup/restore alapok, dependency es secret audit.

## Elkeszult

- Request ID middleware es `X-Request-ID` valasz header.
- Health endpointok: `/health/live`, `/health/ready`, `/health`, `/api/health`.
- Strukturalt logging konfiguracios alap `LOG_LEVEL` es `LOG_FORMAT` beallitassal.
- Failed login alkalmazaslog secret nelkul.
- Admin Audit Log API es admin frontend oldal.
- Felhasznaloi notification preferences API es Account oldali UI.
- Brevo API transport az email service-ben.
- Explicit `EMAIL_DELIVERY_ENABLED` es `NOTIFICATION_EMAIL_ENABLED` kapcsolok.
- Pillow alapu aukciokep validacio es thumbnail/list/detail variansok.
- Serult PNG 400-as hibaval kezelve, nem 500-as backend hibaval.
- Backup es restore PowerShell script alap.
- `.gitignore` kiegeszites backup es upload kimenetekre.

## Brevo / email allapot

A Brevo API kulcs local `.env` fajlban lehet jelen, de nincs verziozva es nem kerult dokumentacioba. Az email kuldes nem indul el pusztan a kulcs megléte miatt. Szükséges kapcsolók:

```text
EMAIL_DELIVERY_ENABLED=true
NOTIFICATION_EMAIL_ENABLED=true
```

Local/dev alapertelmezes: mindketto `false`.

## Tesztek es ellenorzesek

Lefuttatva:

```text
docker compose build backend
docker compose up -d
docker compose exec -T redis redis-cli ping
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic current
docker compose exec -T backend pytest
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm audit
Invoke-WebRequest /health/live
Invoke-WebRequest /health/ready
Invoke-WebRequest /api/health
scripts/backup_database.ps1
scripts/restore_database.ps1
tracked-file secret scan
```

Eredmenyek:

- Redis: `PONG`.
- Alembic: `0006_operations_media_email (head)`.
- Backend pytest: `45 passed, 204 warnings`.
- Frontend build: sikeres Vite production build.
- Frontend npm audit: `found 0 vulnerabilities`.
- Health live: HTTP 200.
- Health ready: HTTP 200, Postgres/Alembic/Redis/storage ok.
- API health: HTTP 200.
- Backup: sikeres dump keszult `backups/` ala.
- Restore: blokkolt, mert a local PostgreSQL role nem rendelkezik `CREATEDB` jogosultsaggal.
- Secret scan: csak `.env.example` placeholder sorokat talalt; valodi secret nem jelent meg tracked fajlokban.

## Restore blocker

A restore script külön teszt adatbazisba probal visszaallitani. A jelenlegi local PostgreSQL role nem hozhat letre uj adatbazist, ezert a restore validacio nem tudott vegigfutni.

A script javitva lett: sikertelen `createdb` vagy `pg_restore` eseten mar nem ter vissza hamis sikerrel.

Kovetkezo manualis teendo: olyan local/ops DB role biztositasa, amely kontrollaltan rendelkezik `CREATEDB` jogosultsaggal restore validaciohoz, vagy kulon restore kontener/profil kialakitasa.

## Biztonsagi megjegyzesek

- `.env` fajlok nincsenek verziozva.
- Backup fajlok nincsenek verziozva.
- Upload kimenetek nincsenek verziozva.
- Brevo kulcs nem kerult ki logba vagy dokumentacioba.
- Email delivery local/dev alapertelmezes szerint tiltott.
- Readiness valasz nem szivarogtat secretet.

## Technikai adossag

- Backend dependency audit teljes pip-audit futasa meg hianyzik, mert `pip_audit` nincs telepitve az image-ben.
- Restore validaciohoz jogosultsagi/profil dontes szukseges.
- Admin Audit Log frontend alap lista; kesobb reszletes szures/export javasolt.
- Production storage backend tovabbra is local storage alaprol indul; S3/R2 jellegu backend kesobbi sprintben javasolt.
- Tobb backend replika eseten a schedulerhez tovabbra is kulon worker vagy leader election szukseges.

## Kovetkezo sprint javaslat

Sprint 7-ben erdemes a restore jogosultsagi modellt es production storage strategiat veglegesiteni, valamint beepiteni egy backend dependency audit eszkozt CI/dev workflowba. Emellett admin audit export, monitoring/alerting es production scheduler worker kialakitas javasolt.
