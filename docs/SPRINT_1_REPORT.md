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

## Mi keszult el

- Local/dev infrastruktura ellenorzese Docker Compose alatt.
- PostgreSQL role, adatbazis es Alembic schema helyreallitasa.
- DEV admin seed ellenorzese es idempotencia igazolasa.
- Normal felhasznaloi regisztracio, login es `/api/auth/me` flow tesztelese.
- Backend admin jogosultsagi hatar ellenorzese.
- Frontend admin redirect UX retege.
- Mobil/tablet hamburger menu.
- Aukcio letrehozo UI 1-5 kep feltoltessel es boritokep valasztassal.
- Dokumentacio konszolidalasa harom aktiv docs fajlba.

## Mit kellett javitani

- A local/dev adatbazisban hianyzott a `users` tabla, ezert az admin seed kezdetben nem tudott lefutni.
- Az Alembic `upgrade head` futtatasa utan a schema helyreallt.
- A dev admin seed kimenete semlegesitve lett, hogy ne irjon ki admin emailt.
- Az email helper kompatibilisse valt string es `User` objektum bemenettel is.
- A `docker-compose.yml` backend build beallitasa rendezve lett, a `Dockerfile` explicit hivatkozasa visszakerult.
- A header mobil/tablet nezetben hamburger menut kapott, hogy ne alakuljon ki vizszintes navigacios tores vagy zsufoltsag.

## Mi maradt hatra

- Aukcio backend domain es API megtervezese es implementalasa.
- Aukcio letrehozas bekotese valos backend vegpontra.
- Kepfeltoltes perzisztalasa es boritokep tarolasa.
- Licitalasi workflow es licitlepcso backend validacio.
- Lezart aukciok 24 oras lathatosaganak backend oldali kezelese.
- Product orokseg fokozatos kivezetese az uj Auction domain javara.

## Technikai adossag

- A `Product` domain meg jelen van oroksegkent.
- Az aukcio letrehozo form jelenleg frontend UI szintu.
- A frontend auth UX localStorage alapu, nem teljes alkalmazasszintu auth provider.
- Az Alembic migracios tortenet jelenleg egy initial migrationre epul.
- A kepfeltolteshez nincs vegleges backend tarolas es validacios workflow.

## Uj TODO-k

- Auction adatmodell veglegesitese seller, status, condition, bid increment, buy-now es five-minute-rule mezokkel.
- Auction image modell vagy tarolasi szerzodes kidolgozasa maximum 5 kepre es egy boritokepre.
- Bid API es jogosultsagi szabalyok megtervezese.
- Sajat aukcio modositas szabalyainak backend validacioja.
- Frontend auth/session provider kialakitasa.
- Admin aukcio moderacios flow pontos definicioja.

## Git commitok

Sprint 1 logikus commitjai:

- `4b17a24` - `fix(devops): harden dev admin and local compose setup`
- `a06b7ab` - `feat(frontend): add responsive navigation and auction image UI`
- `52b09f7` - `docs: consolidate sprint 1 documentation`

## Docker allapot

Ellenorzott local/dev allapot:

- postgres healthy
- redis healthy
- backend running
- frontend running
- compose successful

## Kovetkezo Sprint

Sprint 2 celja az aukcios platform valodi backend domainjenek kialakitasa. A fejlesztes kozeppontjaban az aukcio letrehozas, kepkezeles, boritokep, licitalas, jogosultsagi szabalyok es lezart aukciok eletciklusa all.

A kovetkezo sprintnek a marketplace-only iranyt kell erositenie: az uj funkcioknak az `Auction` domainre kell epulniuk, a klasszikus webshop vagy sajat termek ertekesitesi logika boviteset kerulni kell.
