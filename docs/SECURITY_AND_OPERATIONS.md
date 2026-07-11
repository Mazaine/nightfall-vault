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
