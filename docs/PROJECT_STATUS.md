# Nightfall Vault - Projektallapot

Utolso frissites: 2026-07-13

## Project Version

v0.10.0-dev

Sprint 10 account UX, navigation, accessibility and production hardening implemented

## Aktiv projektmappa

Az aktiv fejlesztesi mappa:

`C:\Users\Eszti\Desktop\nightfall-vault`

A Documents alatti regi masolatok nem tekintendok aktiv munkateruletnek.

## Architecture

Frontend:

- React
- TypeScript
- Vite

Backend:

- FastAPI
- SQLAlchemy
- Alembic

Infrastructure:

- Docker Compose
- PostgreSQL
- Redis

Authentication:

- JWT

## Architecture Principles

A Nightfall Vault marketplace-only aukcios platform.

Alapelvek:

- A platform nem ad el sajat termekeket.
- A tranzakciok elado es vevo kozott tortennek.
- Klasszikus webshop logika nem vezetendo be uj fejleszteskent.
- A `Product` domain atmeneti orokseg, nem celarchitektura.
- Uj fejleszteseknek az `Auction` domaint kell celozniuk.
- A felhasznaloi aukcio, licit, eladoi profil es admin moderacio a kiemelt domain.

## Jelenlegi termekirany

A Nightfall Vault jelenleg aukcios platform, nem klasszikus termekes webshop. A felhasznalok altal feltoltott aukciok allnak a kozpontban.

## Frontend allapot

Meglevo fo oldalak:

- Kezdolap
- Licitjeim
- Aukciok
- Aukcio reszletek
- Kategoriak
- Hogyan mukodik
- Rolunk
- Kapcsolat
- Belepes
- Regisztracio
- Kosar
- Checkout
- Rendelesek
- Admin dashboard
- Admin aukciok
- Admin rendelesek
- Admin felhasznalok
- Admin audit naplo
- Admin jelentessor
- Mentett keresések
- 404/info oldal

## Navigacio

A navbar elemei egy sorban jelennek meg desktop nezetben:

- Kezdolap
- Licitjeim
- Aukciok
- Kategoriak
- Hogyan mukodik?
- Rolunk
- Kapcsolat

Mobilon es tableten hamburger menu hasznalatos. A logo kattintasa admin felhasznalonak az admin feluletre, normal vagy kijelentkezett felhasznalonak a kezdolapra vezet.

## Licitjeim oldal

Az oldal celja:

- a felhasznalo altal kovetett/licitalt aukciok kovetese,
- a sajat aukciok attekintese,
- uj aukcio letrehozasa.

A lezart aukciok UX-szinten szurkitve jelennek meg, es a tervezett mukodes szerint 24 ora utan tunnek el.

## Aukcio letrehozas jelenlegi UI

Az aukcio letrehozo felulet mezoi:

- nev
- 1-5 kep feltoltese
- boritokep valasztasa
- leiras
- kategoria
- allapot
- kezdoar
- licitlepcso
- villamar
- lejarati datum
- 5 perces szabaly kapcsolo
- villamar kapcsolo

Fontos UX szabaly: a kezdoar, licitlepcso es a mar megadott villamar osszege kesobb nem modosithato.

## Backend allapot

Meglevo backend alapok:

- FastAPI
- PostgreSQL
- Redis
- Alembic
- JWT auth
- admin jogosultsagi dependency
- rate limiting
- Turnstile/CAPTCHA konfiguracio
- email szolgaltatas
- pytest tesztek

## Auction Domain

Sprint 2-ben letrejott az onallo Auction domain. Az aukcio nem a `Product` modellre epul, nincs kotelezo webshopos termek kapcsolata, es minden aukcio egy regisztralt eladohoz tartozik.

Letrejott modellek:

- `Auction`
- `AuctionImage`
- `AuctionMessage`
- `AuctionReview`
- `Bid`

## Aukcioallapotok es eletciklus

Kozpontilag kezelt allapotok:

- `draft`
- `scheduled`
- `active`
- `ended`
- `sold`
- `unsold`
- `cancelled`
- `suspended`

Az allapotvaltas backend service logikan keresztul tortenik. Tiltott a tetszoleges frontend statuszfeluliras, a `sold` allapot nyertes nelkul, es az `unsold` allapot nyertessel.

## Idozites

A backend idozonatudatos datetime ertekeket var es UTC-re normalizal. Az idoszinkronizalas idempotens service logikaval tortenik lista-, reszlet- es statuszlekeresek soran, valamint aktivalasi es admin finalize muveleteknel.

## Arkezeles

Az aukcios penzugyi mezok `Numeric` / `Decimal` alapuak, nem float tipusuak. Validalt mezok:

- kezdoar
- licitlepcso
- opcionalis villamar

Aktivalas utan normal elado nem modosithat kritikus ar- es indulasi mezoket.

## Bid Domain es licitmotor

Sprint 3-ban letrejott az onallo `Bid` domain. A licit nem a `Product` oroksegre epul, hanem kozvetlenul az `Auction` domainhez kapcsolodik.

Meglevo licitmotor funkciok:

- hitelesitett felhasznalo licitalhat aktiv aukcion,
- sajat aukciora licit tiltott,
- draft, scheduled, ended, sold, unsold, cancelled es suspended aukcion licit tiltott,
- minimum licit: `current_price + bid_increment`,
- `current_price` es `highest_bid_id` backend oldalon frissul,
- licittortenet publikus, anonimizalt licitalo cimkevel,
- lejart aktiv aukcio licit mellett automatikusan `sold`, licit nelkul `unsold`,
- nyertes a legmagasabb licit licitaloja,
- otperces hosszabbitas mukodik: utolso 5 percben erkezo licit meghosszabbitja a zarast,
- villamarat elero licit az aukciot `sold` allapotba zarja,
- outbid ertesites jon letre a korabbi legmagasabb licitalonak,
- background scheduler zarja a lejart aktiv aukciokat.

Tranzakciobiztonsag:

- a licit elhelyezese adatbazis tranzakcioban tortenik,
- az aukcio sorara row lock kerul (`SELECT ... FOR UPDATE`),
- a minimum licit ellenorzese es a highest bid frissitese egy tranzakcion belul tortenik,
- parhuzamos azonos osszegu liciteknel csak az egyik valhat ervenyes aktualis legmagasabb licitte.

## Realtime, ertesitesek es scheduler

Sprint 4-ben bekerult az aukcio reszletoldali SSE alapu frissites. A stream publikus aukcioknal az aktualis statuszt, aktualis arat, highest bid hivatkozast, nyertest, zarasi idot es licittortenetet kuldi.

Uj backend endpointok:

- `GET /api/auctions/{auction_id}/stream`
- `GET /api/auctions/my-bids`
- `GET /api/auctions/notifications`

Uj modell:

- `Notification`
- `WatchlistItem`
- AuditLog bovites aukcio kapcsolattal

A scheduler in-process FastAPI hatterfeladatkent fut local/dev kornyezetben. Az aktiv, lejart aukciokat adatbazis row lock mellett dolgozza fel, licittel `sold`, licit nelkul `unsold` statuszra.

## Production Readiness

Sprint 5-ben elkeszult:

- Notification Center API es frontend oldal
- olvasatlan ertesites szamlalo
- notification mark read es mark all read
- Watchlist domain es frontend figyelolista
- admin aukcio moderacio: suspend, restore, soft delete
- audit log domain esemenyekhez
- FastAPI lifespan handler a scheduler inditasahoz
- frontend 401 session-expired kezeles

## Kepek es boritokep

Egy aukciohoz legfeljebb 5 kep toltheto fel. Aktiv vagy idozitett aukciohoz legalabb 1 kep es pontosan 1 boritokep szukseges. A backend ellenorzi a MIME-type erteket, a fajl magic byte tartalmat, a fajlmeretet es az ownership szabalyokat.

## Seller Ownership es eladoi nyilatkozat

Az elado mindig az aktualis hitelesitett userbol szarmazik, `seller_id` normal create requestbol nem allithato. Aukcio letrehozashoz kotelezo az eladoi nyilatkozat elfogadasa, amelynek idopontja es verzioja tarolodik.

## Lezart aukcio, chat es ertekeles

Sikeresen lezart aukcio feltetele:

- `status == sold`
- van elado
- van nyertes
- az elado es nyertes kulon felhasznalo
- van veglegesitesi idopont

A chat es ertekeles csak sikeresen lezart aukcio utan erheto el, kizarolag az elado es a nyertes kozott. A sender, reviewer es reviewed user backend oldalon szarmaztatott.

## Frontend bekotesek

Elkeszult:

- aukciolista backendrol
- aukcio reszlet backendrol
- aukcio letrehozas backend API-val
- kepfeltoltes es boritokep kuldes
- aukcio aktivalas/idotizes
- aktiv aukcion licit elhelyezese backend API-val
- aktualis licit es licittortenet megjelenitese backend adatbol
- cim alapu aukcio navigacio
- chat es ertekeles megjelenites backend jogosultsagi flag alapjan
- login/register API bekotes az aktiv frontendben
- kozponti AuthProvider a token es user allapot kezelesere
- aukcio reszletoldali SSE frissites
- Buy Now / villamar gomb az aukcio reszletoldalon
- "Licitjeim" backend adatforras a felhasznalo licitalt aukcioira


## Sprint 6 operational readiness

Elkeszult elemek:

- request ID middleware es `X-Request-ID` valasz header;
- `/health/live`, `/health/ready`, `/health` es `/api/health` endpointok;
- strukturalt logging konfiguracios alap (`LOG_LEVEL`, `LOG_FORMAT`);
- admin Audit Log API es frontend oldal;
- felhasznaloi notification preferences API es Account oldali UI;
- Brevo/API email transport explicit delivery kapcsoloval;
- local image processing Pillow alapon thumbnail/list/detail variansokkal;
- backup es restore PowerShell script alap;
- frontend npm audit es tracked-file secret scan lefuttatva.

Restore validacio: az aktiv dev adatbazis jogosultsagainak modositasa nelkul, izolalt `postgres_restore` Compose profillal sikeresen lefutott. A visszaallitott teszt DB Alembic revisionje `0006_operations_media_email`, a public tablakszam 23.
## Sprint 7 marketplace trust features

Elkeszult elemek:

- publikus felhasznaloi profil API: `GET /api/users/{username}`;
- publikus review lista lapozassal es rendezessel;
- elado kovetes API: `POST /api/follow`, `DELETE /api/follow`, `GET /api/following`;
- seller follow tabla adatbazis constrainttel, self-follow tiltassal es follower/seller unique vedelmekkel;
- kovetett elado uj aktivalt aukciojarol in-app notification tipus;
- paginalt aukciokereso backend oldali szurokkel es rendezesekkel;
- frontend publikus profiloldal, kattinthato eladoi linkek, szuropanel es skeleton/empty/error allapotok;
- Sprint 7 backend tesztek publikus profilra, jogosultsagra, review listara, follow rendszerre, keresesre es rendezesekre.

Publikus profil privacy szabaly: email, admin statusz, belso user ID, notification preference es audit adat nem jelenhet meg a publikus profile response-ban.


## Sprint 8 Trust & Safety

Elkeszult elemek:

- egyseges `Report` domain aukcio- es felhasznaloi jelentesekhez;
- `UserBlock` domain blocker/blocked egyedi parral es self-block tilalommal;
- publikus report API sajat aukcio/profil es duplikalt nyitott report tiltassal;
- admin report queue szuresi, lapozasi, statusz-, prioritas- es jegyzetkezelesi endpointokkal;
- report statusz eletciklus: `open`, `under_review`, `resolved`, `dismissed`, ujranyitas nelkul;
- blokkolas hatasa chatre es kovetesre, aukcioeredmeny visszamenoleges modositas nelkul;
- report resolved/dismissed notification;
- domain audit log report created, status change, priority change, note change, block create es block remove esemenyekhez;
- frontend profil jelentese/blokkolasa, aukcio jelentese, sajat jelenteseim, blokkolt felhasznalok es admin jelentessor.

Privacy szabaly: admin note, prioritas es belso azonositok nem jelennek meg normal felhasznaloi report valaszban. Reporter, reported user, seller, sender es block azonositok backend oldalon szarmaztatottak vagy ellenorzottek.
## Current Technical Debt

- A report domain uj, admin oldalon meg nincs bulk action/export vagy reszletes SLA dashboard.
- A user blocking Sprint 8-ban kommunikaciot es kovetest tilt, teljes profil- vagy aukciolista-rejtes nincs bevezetve.

- A frontend auth allapot kozponti providerbe kerult, de a backend token refresh es session lejarti UX meg nem teljes.
- A `Product` domain meg oroksegkent jelen van a backendben es a legacy frontend kodban.
- Az SSE stream alap frissitest ad, de nincs teljes notification center vagy WebSocket presence.
- A scheduler in-process fut; tobb production backend replika eseten kulon worker vagy leader valasztas javasolt.
- Az email notification csatorna Brevo/API vagy SMTP transporttal konfigurálható, de production engedélyezéshez külön `EMAIL_DELIVERY_ENABLED` és `NOTIFICATION_EMAIL_ENABLED` szükséges.
- Az admin Audit Log API és alap frontend oldal elkészült; később részletesebb szűrés/export javasolt.

## Sprint 9 marketplace UX

Elkeszult elemek:

- cím-, leírás-, eladó-, kategória-, állapot-, licitszám-, Buy Now-, lejárat- és újdonságkeresés backend lapozással;
- felhasználóhoz kötött mentett keresések CRUD API-ja;
- mentett keresés új találatáról kizárólag in-app értesítés;
- szabályalapú kapcsolódó aukciók kategória, cím, eladó és ár alapján;
- az eladó legfeljebb 6 további publikus aukciója, az aktuális aukció kizárásával;
- publikus követő/követett-eladó számok, valamint licit-, nyerési-, vesztési-, eladási- és sikerességi statisztikák;
- mentett keresések oldal, részletoldali ajánlási blokkok és reszponzív loading/empty/error állapotok.
- A FastAPI `on_event` technikai adossag Sprint 5-ben megszunt, a scheduler lifespan handlerrel indul.

## Next Planned Sprint

A kovetkezo sprint celja a fennmarado production dependency adossag kompatibilis FastAPI/Starlette es JWT stack frissitesi terve, a scheduler kulon workerre szervezese, valamint a moderator UX es report SLA/riporting tovabbfejlesztese.

## Sprint 10 account UX és frontend stabilitás

Elkészült:

- védett, közös account layout és reszponzív fióknavigáció;
- külön profil, licitek, saját aukciók, értesítések, mentett keresések, figyelőlista, jelentések és blokkolások route;
- aktív, megnyert és elvesztett licitek, valamint aktív/piszkozat-időzített/lezárt saját aukciók elkülönítése;
- hozzáférhető profil dropdown, adminfeltétel, Escape, külső kattintás és fókusz-visszaadás;
- stabil hamburger menü, backdrop és body scroll lock;
- egységes loading, skeleton, empty, error és retry állapotok;
- globális sötét formkontroll-stílus és aktív frontend UTF-8 audit;
- route title és privát route noindex kezelés;
- route-level code splitting és lusta aukciókép-betöltés;
- frontend Vitest/Testing Library alap 9 regressziós teszttel;
- privát API-válaszok `Cache-Control: no-store, private` védelme;
- CI workflow, Docker healthcheckek és `.dockerignore` fájlok.

Sprint 10-ben nem volt adatmodell-változás, ezért új Alembic migráció nem készült; a head továbbra is `0009_saved_searches`.
