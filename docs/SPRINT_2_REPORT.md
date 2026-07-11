# Nightfall Vault - Sprint 2 zarojelentes

Datum: 2026-07-11

## 1. Osszefoglalo

A Sprint 2 celja egy onallo Auction domain kialakitasa volt, amely nem a Product oroksegre epul. A backend domain, migracio, API, kepfeltoltes, aukcio-eletciklus, lezart aukciohoz kotott chat es ertekeles alapjai elkeszultek.

Statusz: reszben kesz. A backend es az alap frontend bekotes mukodik, a tesztek es build sikeresek. A teljes licitmotor, Bid domain, licittortenet, automatikus nyertes-meghatarozas, WebSocket chat es admin moderacios UI tovabbi sprintekre marad.

## 2. Elkeszult modellek

Modellek:

- `Auction`
- `AuctionImage`
- `AuctionMessage`
- `AuctionReview`

Fontos kapcsolatok:

- `Auction.seller_id` kotelezo `users.id` idegen kulcs
- `Auction.winner_id` nullable `users.id` idegen kulcs
- `AuctionImage.auction_id` cascade torlessel kapcsolodik az aukciohoz
- `AuctionMessage.auction_id` es `sender_id`
- `AuctionReview.auction_id`, `reviewer_id`, `reviewed_user_id`

Constraint-ek es indexek:

- status check constraint
- condition check constraint
- pozitiv kezdoar es licitlepcso
- villamar csak bekapcsolt villamar mellett
- `ends_at > starts_at`
- seller es winner nem lehet azonos
- `sold` statuszhoz winner szukseges
- `unsold` statusz winner nelkul ervenyes
- maximum egy boritokep reszleges unique indexszel
- ertekelesnel rating 1-5
- ertekelesnel nincs onertekeles
- egy aukcion belul egy reviewer/reviewed par csak egyszer ertekelhet

## 3. Aukcio-eletciklus

Statuszok:

- `draft`
- `scheduled`
- `active`
- `ended`
- `sold`
- `unsold`
- `cancelled`
- `suspended`

Engedelyezett atmenetek:

- `draft -> scheduled`
- `draft -> active`
- `draft -> cancelled`
- `scheduled -> active`
- `scheduled -> cancelled`
- `scheduled -> suspended`
- `active -> ended`
- `active -> cancelled`
- `active -> suspended`
- `ended -> sold`
- `ended -> unsold`
- `ended -> suspended`
- `suspended -> draft`
- `suspended -> scheduled`
- `suspended -> active`

Tiltott atmenetek:

- `sold -> active`
- `unsold -> active`
- `cancelled -> active`
- nyertes nelkuli `sold`
- nyertessel rendelkezo `unsold`
- frontendrol kuldott tetszoleges statuszfeluliras

Automatikus idoszinkronizalas:

- `scheduled` aukcio `active` lesz, ha a kezdési ido elerkezett
- `active` aukcio `ended` lesz, ha a zarasi ido elmult
- a szinkron lista-, reszlet-, statusz-, aktivalasi es finalize muveleteknel fut

Sikeres lezárás feltételei:

- `status == sold`
- van ervenyes elado
- van ervenyes nyertes
- elado es nyertes kulon felhasznalo
- van `finalized_at`

## 4. Adatbazis es migracio

Migracio fajl:

- `backend/alembic/versions/0002_auction_domain.py`

Revision:

- `0002_auction_domain`

Letrehozott tablak:

- `auctions`
- `auction_images`
- `auction_messages`
- `auction_reviews`

Ellenorzes:

- `docker compose exec -T backend alembic upgrade head` sikeres
- `docker compose exec -T backend alembic downgrade 0001_initial_template` sikeres
- downgrade utan `alembic current`: `0001_initial_template`
- visszaallitas `head` allapotra sikeres

Tiszta adatbazis ellenorzes: a migracio az SQLAlchemy metadata alapjan tiszta local/dev adatbazison is letrehozza az uj tablakat.

## 5. API-vegpontok

Uj vegpontok:

- `GET /api/auctions` - publikus aukciolista, auth nem kotelezo
- `POST /api/auctions` - aukcio letrehozasa, auth kotelezo, seller az aktualis user
- `GET /api/auctions/me` - sajat aukciok, auth kotelezo
- `GET /api/auctions/{auction_id}` - aukcio reszlet, draft csak tulajdonos/admin
- `PATCH /api/auctions/{auction_id}` - sajat aukcio modositas, ownership kotelezo
- `POST /api/auctions/{auction_id}/activate` - aktivacio vagy idozites, ownership kotelezo
- `POST /api/auctions/{auction_id}/cancel` - megszakitas, ownership kotelezo
- `GET /api/auctions/{auction_id}/status` - statuszlekeres, lathatosagi szabalyokkal
- `POST /api/auctions/{auction_id}/admin/finalize` - admin finalize, admin kotelezo
- `GET /api/auctions/{auction_id}/images` - kep lista, lathatosagi szabalyokkal
- `POST /api/auctions/{auction_id}/images` - kepfeltoltes, ownership kotelezo
- `POST /api/auctions/{auction_id}/images/{image_id}/cover` - boritokep valasztas, ownership kotelezo
- `DELETE /api/auctions/{auction_id}/images/{image_id}` - kep torles, ownership kotelezo
- `GET /api/auctions/{auction_id}/messages` - lezart aukcio chat, seller/winner
- `POST /api/auctions/{auction_id}/messages` - chat uzenet, seller/winner
- `GET /api/auctions/{auction_id}/reviews` - ertekelesek listazasa
- `POST /api/auctions/{auction_id}/reviews` - ertekeles letrehozasa, seller/winner

## 6. Frontend bekotesek

Elkeszult:

- auth login/register API bekotes
- aukciolista backendrol
- aukcio reszlet backendrol
- sajat aukciok listaja backendrol
- aukcio letrehozasa backend API-val
- eladoi nyilatkozat elfogadasa
- 1-5 kep feltoltes
- boritokep kuldese
- aukcio aktivalas/idotizes
- sajat aukcio leirasmodositas
- sajat aukcio megszakitas
- aukcio cimere kattintas reszletoldalhoz
- kulon "Reszletek" gomb eltavolitasa
- chat megjelenites backend flag alapjan
- ertekeles gomb backend flag alapjan
- "Hogyan mukodik?" oldal frissitese

## 7. Ownership

Az aukcio eladoja mindig az aktualis hitelesitett user. A frontendrol kuldott `seller_id` nem resze a create semanak, ezert nem tudja felulirni a tulajdonost.

Minden modosito muvelet backend oldalon ellenorzi az ownershipet vagy admin jogosultsagot. Idegen felhasznalo sajat aukcion kivuli modositasnal `403` valaszt kap.

Draft aukcio lathatosaga vedett: idegen felhasznalonak `404`, hogy a draft lete se szivarogjon ki.

## 8. Chat jogosultsag

A chat csak sikeresen lezart aukcio utan erheto el. Hozzaferhet:

- elado
- nyertes

A sender automatikusan az aktualis userbol szarmazik. Idegen felhasznalo nem kuldhet es nem olvashat uzenetet. Ures es tul hosszu uzenet tiltott.

Korlatozas: nincs WebSocket, jelenlet, push ertesites vagy gepelesi allapot.

## 9. Ertekelesi jogosultsag

Ertekelhet:

- elado a nyertest
- nyertes az eladot

Tiltott:

- lezaras elotti ertekeles
- onertekeles
- nem resztvevo ertekelese
- duplikalt ertekeles
- frontendrol kuldott reviewed user manipulacio

Unique constraint:

- `auction_id`, `reviewer_id`, `reviewed_user_id`

Az ertekeles modositasara Sprint 2-ben nincs kulon endpoint.

## 10. Validaciok

Validalt teruletek:

- kezdoar pozitiv
- licitlepcso pozitiv
- villamar csak bekapcsolt villamar mellett
- villamar nagyobb a kezdoarnal
- idozonatudatos idopontok
- `ends_at > starts_at`
- statusz atmenetek
- minimum 1 es maximum 5 kep aktivalaskor
- pontosan 1 boritokep aktivalaskor
- MIME-type whitelist
- magic byte kepellenorzes
- 5 MB kepmeret korlat
- uzenethossz maximum 2000 karakter
- ertekeles 1-5 egesz
- komment maximum 1000 karakter

## 11. Biztonsagi ellenorzesek

Ellenorzott vedelmek:

- seller spoofing tiltott
- winner spoofing csak admin finalize alatt
- sender spoofing tiltott
- reviewer spoofing tiltott
- reviewed user manipulacio tiltott
- IDOR vedett ownership ellenorzessel
- XSS kockazat csokkentve React escapinggel
- fajlfeltoltes MIME es magic byte ellenorzessel
- statuszmanipulacio service logikan keresztul tiltott
- jogosulatlan muveleteknel `401`, `403`, `404`, `409`, `422` valaszok

## 12. Tesztek

Letrehozott tesztfajl:

- `backend/tests/test_auction_domain.py`

Lefedett fo esetek:

- auth kotelezo aukcio letrehozashoz
- seller automatikusan aktualis user
- seller spoofing nem mukodik
- ar- es idovalidacio
- draft aukcio nem publikus
- ownership modositas
- kepfeltoltes es boritokep
- kep nelkuli aktivalas tiltott
- aktiv aukcio kritikus mezoi zaroltak
- sold aukcio chat jogosultsag
- ertekeles jogosultsag es duplikacio tiltasa

Futtatott parancs:

```powershell
docker compose exec -T backend pytest
```

Eredmeny:

- 15 teszt osszesen
- 15 sikeres
- 0 sikertelen
- 0 kihagyott

## 13. Frontend build

Futtatott parancs:

```powershell
docker compose exec -T frontend npm run build
```

Eredmeny: sikeres.

Javitott build/TypeScript problemak: a Sprint 2 vegen nem maradt buildhiba.

## 14. Docker allapot

Ellenorzott szolgaltatasok:

- postgres
- redis
- backend
- frontend

Docker Compose strukturat nem kellett atalakítani.

## 15. Dokumentacio

Modositott dokumentumok:

- `README.md`
- `docs/PROJECT_STATUS.md`
- `docs/SECURITY_AND_OPERATIONS.md`
- `docs/SPRINT_2_REPORT.md`

Fontos uj reszek:

- Auction domain leiras
- migracios es teszt parancsok
- kepfeltoltes biztonsag
- ownership es spoofing vedelmek
- chat es ertekeles jogosultsag
- Sprint 2 eredmenyek es technikai adossag

## 16. Git commitok

Sprint 2 commitok:

- `932d25e` - `feat(auction): add auction domain and lifecycle`
- `17c310b` - `feat(frontend): connect auction ownership flows`
- `3373fa1` - `docs(frontend): update auction flow guidance`
- `7222825` - `feat(frontend): add auction owner actions`
- dokumentacios zaro commit: `docs: add sprint 2 report and operations updates`

## 17. Mi maradt hatra

- teljes licitmotor
- Bid modell
- licittortenet
- automatikus nyertes-meghatarozas
- otperces hosszabbitas tenyleges vegrehajtasa
- WebSocket chat
- ertesitesek
- fizetes
- szallitas
- vitakezeles
- teljes admin moderacios UI
- teljes auth provider alapu frontend session architektura

## 18. Technikai adossag

- Product domain orokseg: a backendben es legacy frontendben meg jelen van. Kockazat: uj fejlesztes veletlenul erre epulhet. Javasolt kezeles: Sprint 3 utan fokozatos leválasztas.
- Frontend auth localStorage UX: mukodik, de nem teljes auth provider architektura. Kockazat: inkonzisztens UI allapot. Javasolt kezeles: Sprint 3 vagy Sprint 4.
- Admin moderacios UI hianyos: backend admin finalize van, de teljes moderacios felulet nincs. Kockazat: kezi admin folyamatok nehezkesek. Javasolt kezeles: Sprint 4.
- Licitmotor hianya: az Auction domain elokeszult, de Bid nelkul nincs teljes aukcios tranzakcio. Kockazat: az aktiv aukciok meg nem teljes uzleti folyamatok. Javasolt kezeles: Sprint 3.
- Kepfeldolgozas alap szintu: MIME es magic byte ellenorzes van, de nincs kepoptimalizalas vagy virus scan. Kockazat: production kornyezetben tovabbi hardening kell. Javasolt kezeles: production elotti security sprint.

## 19. Uj TODO-k

- `Bid` modell es API megtervezese.
- Licit tranzakcios zarolas es konkurenciakezeles.
- Licittortenet publikus es sajat nezetek.
- Automatikus nyertes-meghatarozas.
- Otperces hosszabbitas scheduler vagy idempotens job kialakitasa.
- Admin aukcio moderacios UI.
- Teljes auth provider bevezetese az aktiv frontendben.
- Kepoptimalizalas es production storage strategia.
- Chat read state es egyszeru ertesitesi alap.

## 20. Kovetkezo sprint javaslat

Sprint 3 javasolt temaja: licitmotor, Bid domain, licittortenet, konkurenciakezeles, tranzakciobiztonsag, automatikus lezaras es nyertes-meghatarozas.

A Sprint 3-nak arra kell epulnie, hogy az Auction domain mar kulon kezeli az eladot, statuszt, arakat, idozitest es lezart aukcio resztvevoit. A kovetkezo kritikus kockazat a parhuzamos licitalas es a helyes nyertes meghatarozasa, ezert a tranzakcios backend logika legyen az elso prioritas.

## Elfogadasi feltetelek allapota

Teljesult:

- onallo Auction modell
- Producttol fuggetlen domain
- kozponti statuszok es eletciklus
- seller ownership backend oldalon
- ar-, ido-, kep- es statuszvalidacio
- kepfeltoltes maximum 5 keppel
- boritokep integritas
- eladoi nyilatkozat tarolasa
- aukcio CRUD alapok
- draft aukcio vedett lathatosaga
- cim alapu reszletnavigacio
- chat es ertekeles sold aukciohoz kotve
- backend tesztek sikeresek
- frontend build sikeres
- migracio upgrade es downgrade ellenorzott

Reszben teljesult vagy kovetkezo sprintre maradt:

- teljes licitmotor
- automatikus otperces hosszabbitas
- automatikus nyertes-meghatarozas
- teljes admin moderacios UI
- WebSocket chat
