# Nightfall Vault - Biztonsag es uzemeltetes

Utolso frissites: 2026-07-11

## Secret kezeles

A repository nem tartalmazhat valodi jelszot, API kulcsot vagy eles secretet.

Engedelyezett:

- `.env.example`
- `backend/.env.example`
- `frontend/.env.example`

Tiltott:

- `.env`
- `.env.*` a peldafajlok kivetelevel
- privat kulcsok
- tanusitvanyok
- backup fajlok, amelyek secretet tartalmazhatnak

A `.gitignore` tartalmazza az erzekeny fajlok mintait.

## Local/dev admin

Local admin letrehozasa csak kornyezeti valtozokbol tortenhet.

Kotelezo valtozok:

- `DEV_ADMIN_EMAIL`
- `DEV_ADMIN_PASSWORD`

Opcionals valtozok:

- `DEV_ADMIN_USERNAME`
- `DEV_ADMIN_FULL_NAME`

A seed script production kornyezetben megtagadja a futast, es nem tartalmaz alapertelmezett jelszot. A script kimenete nem ir ki jelszot.

Futtatas local/dev kornyezetben:

```powershell
docker compose exec -T backend python -m app.scripts.seed_dev_admin
```

## Secret generalas

Fejlesztoi secret generalasa:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

PostgreSQL jelszo generalasa:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Local adatbazis javitas

2026-07-11-en a local PostgreSQL peldanyban hianyzott a `nightfall_vault_dev` role es adatbazis. A local/dev kornyezetben a role es adatbazis helyre lett allitva, majd Alembic migracio futott.

Ellenorzott allapot:

- PostgreSQL kapcsolat rendben
- Redis `PONG`
- Alembic revision: `0001_initial_template (head)`
- `users` tabla letrejott

## Docker Compose

Aktiv szolgaltatasok:

- `postgres`
- `redis`
- `backend`
- `frontend`

Health ellenorzesek:

```powershell
docker compose ps
docker compose exec -T redis redis-cli ping
docker compose exec -T backend alembic current
```

## Repository audit eredmeny

2026-07-11-en ellenorizve:

- `.env` nincs verziozva
- csak `.env.example` fajlok szerepelnek a gitben
- ismert korabbi fejlesztoi jelszomintak nem jelentek meg a git history keresesi eredmenyeiben
- a secret scan csak peldaszovegeket talalt `.env.example` fajlokban

## Manualis teendok

- Eles kornyezethez kulon secret keszlet kell.
- Eles admin felhasznalot ne seed script hozzon letre.
- Deploy elott kulon secret scan es dependency audit javasolt.

## Production Checklist

Elesites elott az alabbi pontokat kotelezo ellenorizni:

- Production secret keszlet letrehozasa es kulonvalasztasa a local/dev ertekektol.
- HTTPS es biztonsagos cookie/CORS konfiguracio ellenorzese.
- PostgreSQL backup strategia es visszaallitasi proba.
- Redis konfiguracio es adatvesztesi kockazat dokumentalasa.
- Dependency audit frontend es backend oldalon.
- Teljes repository secret scan.
- Turnstile production site key es secret beallitasa.
- SMTP/Brevo production kulcsok es sender domainek ellenorzese.
- Monitoring es error logging bekotese.
- Rate limiting eles kornyezetre szabasa.
- Admin letrehozasi folyamat ellenorzese seed jelszo nelkul.

## Incident Recovery

Adatbazis serules eseten az alkalmazast irasi muveletekre le kell allitani, a legutolso ismert jo PostgreSQL backupot kell visszaallitani, majd Alembic revision es adatkonzisztencia ellenorzest kell futtatni. Visszaallitas utan a felhasznaloi aukciok, licitek es admin jogosultsagok mintavetelezett ellenorzese szukseges.

Redis leallas eseten a backendnek degradalt modban kell kezelnie a rate limiting es ideiglenes cache funkciokat. Elso lepes a Redis kontener/szolgaltatas ujrainditasa, majd a backend logok ellenorzese. Ha Redis tartosabban nem elerheto, a rate limiting backend konfiguraciot es a kapcsolodo kockazatot kulon kell kezelni.

Backend indulasi hiba eseten a Docker logokat, kornyezeti valtozokat, adatbazis kapcsolatot es Alembic allapotot kell ellenorizni. Tipikus helyreallitasi sorrend: `.env` validalas, PostgreSQL/Redis health, `alembic current`, majd backend ujrainditas.

Frontend build hiba eseten a TypeScript hibakat, Vite build kimenetet es dependency valtozasokat kell ellenorizni. A javitas utan production buildet kell futtatni, es csak sikeres build utan szabad deployt kesziteni.
