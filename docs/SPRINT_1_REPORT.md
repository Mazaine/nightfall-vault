# Nightfall Vault - Sprint 1 zarojelentes

Datum: 2026-07-11

## Vegrehajtasi sorrend

1. Git- es munkafaallapot ellenorzese.
2. Docker Compose es kornyezeti valtozok auditja.
3. PostgreSQL, Redis, Alembic es health ellenorzese.
4. DEV admin seed auditja es idempotenciatesztje.
5. Normal felhasznaloi regisztracio es auth flow tesztelese.
6. Backend admin- es jogosultsagi tesztek.
7. Frontend session, protected route es admin redirect audit.
8. Secret- es repository-biztonsagi vizsgalat.
9. Frontend build es backend pytest.
10. Celzott dokumentaciofrissites.
11. Hamburger menu mobil es tabletre.
12. Aukcio letrehozasa: 1-5 kep es boritokep valasztas UI.

## Git es munkafa

Kiindulo allapot:

- branch: `main`
- origin: `https://github.com/Mazaine/nightfall-vault.git`
- HEAD es `origin/main` egyezett a munka elejen.

Kiindulaskor mar volt nehany nem commitolt valtozas:

- `docker-compose.yml`
- `frontend/src/pages/home/HomeFeatured.tsx`
- `frontend/src/styles/base/global.css`

Ezeket a Sprint zarasakor kulon kellett kezelni a friss modositasok mellett.

## Infrastruktura audit

Docker Compose szolgaltatasok:

- `postgres`
- `redis`
- `backend`
- `frontend`

Ellenorzesek:

- PostgreSQL kontener healthy
- Redis kontener healthy
- backend kontener fut
- frontend kontener fut
- backend health endpoint valasza: `status: ok`

Alembic:

- `alembic upgrade head` lefutott
- aktualis revision: `0001_initial_template (head)`

## DEV admin seed

Megallapitasok:

- nincs beégetett admin jelszo a seed scriptben
- production kornyezetben a script megtagadja a futast
- a script idempotens: egymas utan ketszer lefuttatva is sikeres
- a kimenet semlegesitve lett, admin emailt nem ir ki

## Auth es jogosultsag

Normal user flow:

- regisztracio sikeres valid emaillel
- dev tesztben email-verified flag beallitasa utan login sikeres
- `/api/auth/me` helyes user adatot ad vissza

Jogosultsag:

- normal user admin endpointon `403`
- admin user `/api/admin/me` endpointon elerheto

## Frontend session es admin redirect

Megallapitas:

- a header localStorage-ban tarolt `nightfall_user` alapjan jeleniti meg a felhasznalot
- a logo admin felhasznalonak `/admin`, masnak `/`
- a frontend admin route most nem admin session eseten `/` oldalra redirectel

Fontos: a frontend route vedelme UX reteg. A valodi biztonsagi kapu tovabbra is a backend admin jogosultsag.

## Secret audit

Eredmeny:

- `.env` nincs verziozva
- `.gitignore` tartalmazza az erzekeny mintakat
- ismert korabbi jelszomintakra nem volt git history talalat
- secret scan csak `.env.example` peldaszovegeket talalt

## Frontend fejlesztes

Elkeszult:

- mobil/tablet hamburger menu
- desktopon egysoros navbar megtartva
- admin logo route logika megtartva
- kozvetlen `/admin` route redirect nem admin session eseten
- aukcio letrehozo UI: minimum 1, maximum 5 kep
- boritokep valasztasi lehetoseg
- kepvalidacios uzenetek

## Futtatott tesztek

Frontend:

```powershell
docker compose exec -T frontend npm run build
```

Eredmeny: sikeres.

Backend:

```powershell
docker compose exec -T backend pytest
```

Eredmeny: `8 passed`.

## Ismert hianyossagok

- Az aukcio letrehozas backend API-ja meg nincs bekotve a frontend formhoz.
- A kepfeltoltes UI jelenleg fajlvalasztas es boritokep-valasztas szintu.
- Eles deploy elott kulon dependency audit, secret scan es production konfiguracio ellenorzes szukseges.

## Sprint 1 keszultsegi allapot

A Sprint 1 celjai local/dev szinten teljesultek. A projekt futtathato, a frontend build es backend pytest sikeres, a biztonsagi alapellenorzesek rendben vannak.
