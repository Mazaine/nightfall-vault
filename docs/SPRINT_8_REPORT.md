# Nightfall Vault - Sprint 8 Report

Datum: 2026-07-13
Verzio: v0.8.0-dev
Statusz: elkeszult, ellenorzott
Push: nem tortent

## Sprint cel

A Sprint 8 celja a Trust & Safety reteg kiepitese volt: felhasznaloi es aukciojelentesek, admin moderacios jelentessor, felhasznaloi blokkolas, audit naplozas es kapcsolodo frontend feluletek.

## Mi keszult el

- Egyseges `Report` backend domain aukcio- es felhasznaloi celokhoz.
- `UserBlock` backend domain egyedi blocker/blocked parral es self-block tiltassal.
- Publikus report API: aukcio jelentese, user jelentese, sajat reportok listazasa es reszletezese.
- Admin report API: lista, reszlet, statuszvaltas, prioritasvaltas es admin note frissites.
- Report statusz eletciklus: `open`, `under_review`, `resolved`, `dismissed`, lezart report ujranyitasa nelkul.
- Report resolved/dismissed notification backend oldalon.
- Blokkolas hatasa: follow tiltasa, letezo follow kapcsolat eltavolitasa, uj chat uzenet tiltasa elado es nyertes kozott.
- Audit logok: report created, report status changed, report priority changed, report note changed, user block created, user block removed.
- Frontend: aukcio jelentese gomb, profil jelentese/blokkolasa, sajat jelenteseim, blokkolt felhasznalok, admin jelentessor.

## Backend API-k

Publikus:

- `POST /api/reports/auctions/{auction_id}`
- `POST /api/reports/users/{username}`
- `GET /api/reports/me`
- `GET /api/reports/me/{report_id}`
- `POST /api/blocks/{username}`
- `DELETE /api/blocks/{username}`
- `GET /api/blocks`
- `GET /api/blocks/{username}/status`

Admin:

- `GET /api/admin/reports`
- `GET /api/admin/reports/{report_id}`
- `PUT /api/admin/reports/{report_id}/status`
- `PUT /api/admin/reports/{report_id}/priority`
- `PUT /api/admin/reports/{report_id}/note`

## Tesztelt elfogadasi feltetelek

Automatizalt TestClient API tesztek fedik:

- aukcio jelentese;
- sajat aukcio jelentese tiltott;
- duplikalt nyitott aukcio report tiltott;
- user jelentese;
- sajat profil jelentese tiltott;
- sajat report lista es privacy;
- admin report lista;
- admin statuszvaltas;
- admin prioritasvaltas;
- admin note frissites;
- audit log letrejotte erzekeny szoveges tartalom nelkul;
- report resolved notification;
- user blokkolas letrehozas es torles;
- blokkolt user kovetesenek tiltasa;
- blokkolt chat uzenet tiltasa.

## Biztonsagi megjegyzesek

- Reporter, seller, reported user, sender, blocker es blocked azonositok backend oldalon szarmaztatottak vagy ellenorzottek.
- Normal felhasznaloi report valasz nem ad vissza admin note-ot vagy prioritast.
- Admin note teljes szovege nem kerul audit metadata-ba.
- A blokkolas nem modositja visszamenoleg a liciteket, aukcioeredmenyeket vagy regi chat uzeneteket.
- `dangerouslySetInnerHTML` hasznalata nem kerult be a Sprint 8 frontend kodba.

## Futtatott ellenorzesek

- `docker compose up -d` -> szolgaltatasok futnak, postgres es redis healthy; orphan `postgres_restore` figyelmeztetes megjelent, torles nem tortent
- `docker compose exec -T backend alembic upgrade head` -> sikeres, uj migracio nem volt hatra
- `docker compose exec -T backend alembic current` -> `0008_reports_and_user_blocks (head)`
- `docker compose exec -T redis redis-cli ping` -> `PONG`
- `docker compose ps` -> backend, frontend, postgres, redis fut; postgres es redis healthy
- `docker compose exec -T backend pytest` -> 52 passed, 280 warnings
- `docker compose exec -T frontend npm run build` -> sikeres Vite production build

## Ismert technikai adossag

- Az admin report UI alap lista/reszlet felulet; bulk action, export es SLA dashboard meg nincs.
- A user blocking Sprint 8-ban kommunikaciot es kovetest tilt; teljes profil- vagy aukcio-rejtes nem celja ennek a sprintnek.
- A report workflow meg nincs osszekotve automatikus aukcio suspend/delete muvelettel; a report lezarasa es az aukcio moderacio kulon admin muvelet marad.
- A meglivo frontendben tovabbra is vannak korabbi karakterkodolasbol szarmazo hibas magyar szovegek, ez nem Sprint 8 scope volt.

## Docker allapot

- postgres: running, healthy
- redis: running, healthy
- backend: running
- frontend: running
- compose: successful

## Sprint 8 vegleges statusz

A Sprint 8 elfogadasi feltetelei a lefuttatott automatizalt tesztek, migracio, Docker ellenorzes es frontend build alapjan teljesultek. A sprint lezartnak tekintheto, a fenti technikai adossagok kovetkezo sprintekre vihetok tovabb.
