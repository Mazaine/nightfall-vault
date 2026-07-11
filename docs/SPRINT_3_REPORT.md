# Nightfall Vault - Sprint 3 zarojelentes

Datum: 2026-07-11

## 1. Osszefoglalo

A Sprint 3 celja az elso valodi licitmotor elkeszitese volt. A sprint vegere letrejott az onallo `Bid` domain, a tranzakciobiztos licit elhelyezes, a backend oldali `current_price` es `highest_bid` kezeles, a publikus licittortenet, valamint a lejart aukciok automatikus `sold` / `unsold` allapotba rendezese.

Statusz: elkeszult, technikai adossaggal. A WebSocket, push ertesites, teljes buy now lezaro folyamat es kulon idozitett scheduler nem resze ennek a sprintnek.

## 2. Elkeszult modellek

Uj modell:

- `Bid`

Minimum mezok:

- `id`
- `auction_id`
- `bidder_id`
- `amount`
- `created_at`

Auction modell bovites:

- `current_price`
- `highest_bid_id`
- `highest_bid` kapcsolat
- `bids` kapcsolat

A `Bid` domain kozvetlenul az `Auction` domainhez kapcsolodik, nem epul a `Product` oroksegre.

## 3. Uj API-k

Uj vegpontok:

- `POST /api/auctions/{auction_id}/bids` - licit elhelyezese hitelesitett felhasznaloknak
- `GET /api/auctions/{auction_id}/bids` - publikus, anonimizalt licittortenet

A bid create request csak az osszeget fogadja. A `bidder_id`, `current_price`, `highest_bid_id` es winner adat nem frontendrol jon.

## 4. Licitmotor mukodese

Licit csak `active` aukcion helyezheto el. Tiltott:

- anonim licit
- sajat aukciora licit
- draft, scheduled, ended, sold, unsold, cancelled vagy suspended aukciora licit
- nem pozitiv osszeg
- `current_price + bid_increment` alatti licit

Sikeres licit eseten:

- letrejon egy `Bid` rekord,
- frissul az `Auction.current_price`,
- frissul az `Auction.highest_bid_id`,
- a valasz jelzi, hogy a licit elerte-e a villamarat.

## 5. Tranzakciobiztonsag

A licit elhelyezese adatbazis tranzakcioban tortenik. A backend a licitalt aukcio sorat `SELECT ... FOR UPDATE` lockkal zarolja, majd ugyanabban a tranzakcioban:

- frissiti az aukcio idoszinkronjat,
- ellenorzi az aktiv statuszt,
- ellenorzi a sajat aukciora licit tiltasat,
- kiszamolja a minimum licitet,
- letrehozza a `Bid` rekordot,
- frissiti a `current_price` es `highest_bid_id` mezoket.

Konkurens azonos osszegu licitek tesztelve vannak: az egyik licit sikeres, a masik mar a frissult aktualis ar alapjan elutasitott.

## 6. Current price logika

Uj aukcio letrehozasakor:

- `current_price = starting_price`

Sikeres licit utan:

- `current_price = bid.amount`
- `highest_bid_id = bid.id`

A frontend nem szamolja az aktualis arat. Lista-, reszlet- es sajat aukcio nezetek backendbol kapott `current_price` adatot jelenitenek meg.

## 7. Winner meghatarozasa

Lejart aktiv aukcio szinkronizalaskor automatikusan zarodik:

- ha van legmagasabb licit: `status = sold`, `winner_id = highest_bid.bidder_id`
- ha nincs licit: `status = unsold`, `winner_id = null`

A Sprint 2 chat es ertekeles logika tovabbra is a sikeresen lezart, `sold` statuszu aukciora epul.

## 8. Otperces hosszabbitas

Az otperces szabaly alapja service-szinten bekerult. Ha aktiv aukcion, bekapcsolt otperces szaballyal, a zaras elotti utolso ot percben erkezik licit, az `ends_at` a jelenlegi idoponthoz kepest ot perccel meghosszabbodik.

Kulon scheduler vagy background worker nincs. Emiatt az idozitett, felhasznaloi muvelet nelkuli automatikus statuszfrissites tovabbi sprint feladata.

## 9. Licittortenet

A licittortenet publikus lathato aukcioknal lekerdezheto.

Megjelenitett mezok:

- licit osszege
- letrehozasi idopont
- anonimizalt licitalo cimke
- `is_highest` jelzes

Valodi `bidder_id` nem jelenik meg a publikus history valaszban.

## 10. Frontend bekotesek

Elkeszult:

- `current_price` tipus es megjelenites
- licit elhelyezese az aukcio reszletoldalon
- backend validacios hibak megjelenitese
- sikeres licit utan aukcio es history frissites
- licittortenet megjelenitese
- aukciokartyak aktualis arat hasznalnak kezdor helyett, ha van backend current price

Nem keszult redesign. A frontend a meglovo oldalstrukturan belul kapott minimalis licit UI-t.

## 11. Biztonsagi audit

Ellenorzott vedelmek:

- sajat aukciora licit tiltasa
- bidder spoofing tiltasa
- winner backend oldali szarmaztatasa
- current price frontend manipulacio tiltasa
- IDOR vedett licittortenetnel
- SQL injection kockazat csokkentve SQLAlchemy statementekkel
- XSS: licittortenet adatok React escapinggel jelennek meg
- Decimal / Numeric penzkezeles, float nelkul
- konkurens licitek row lockinggal vedve

## 12. Tesztek

Uj tesztfajl:

- `backend/tests/test_bid_domain.py`

Lefedett fo esetek:

- sikeres licit
- tul alacsony licit
- bid increment ellenorzes
- sajat aukciora licit tiltasa
- lezart aukciora licit tiltasa
- suspended aukciora licit tiltasa
- konkurens licitek
- `current_price` frissulese
- winner meghatarozasa
- `unsold` allapot licit nelkul
- publikus, anonimizalt licittortenet
- buy now elokeszito jelzes

Futtatott parancs:

```powershell
docker compose exec -T backend pytest
```

Eredmeny:

- 29 teszt osszesen
- 29 sikeres
- 0 sikertelen
- 0 kihagyott
- 121 warning

## 13. Frontend build

Futtatott parancs:

```powershell
docker compose exec -T frontend npm run build
```

Eredmeny: sikeres.

Build output:

- `tsc && vite build`
- 72 modul transformalva
- production bundle elkeszult

## 14. Docker allapot

Futtatott parancs:

```powershell
docker compose ps
```

Ellenorzott allapot:

- postgres healthy
- redis healthy
- backend running
- frontend running

## 15. Migracio

Uj migracio:

- `backend/alembic/versions/0003_bid_domain.py`

Revision:

- `0003_bid_domain`

Futtatott parancsok:

```powershell
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic current
```

Eredmeny:

- `0003_bid_domain (head)`

Kulon ures adatbazisos migracios proba nem futott.

## 16. Git commitok

Sprint 3 implementacios commit:

- `c18c36c` - `feat(auction): add transaction-safe bidding`

Dokumentacios zaro commit:

- `docs: add sprint 3 report and bidding documentation`

## 17. Technikai adossag

- Nincs WebSocket vagy push alapu licitfrissites.
- Nincs kulon scheduler a lejart aukciok hatterben torteno automatikus zarasara.
- A buy now csak elokeszito jelzest ad, nem zarja automatikusan az adasveteli folyamatot.
- A frontend auth/session UX tovabbra sem teljes provider alapu.
- A "Licitjeim" oldalon a felhasznalo altal licitalt aukciok listaja meg nincs kulon backend endpointtal megtamogatva.
- Product domain tovabbra is oroksegkent jelen van.

## 18. Sprint 4 javaslat

Sprint 4 javasolt celja a licitalasi elmeny es operacios folyamatok erositese: sajat licitek listaja, outbid jelzes, ertesitesi alapok, buy now vegleges workflow, admin aukcio moderacio es idozitett lezaro job.

Ezzel parhuzamosan erdemes megkezdeni a frontend session provider kialakitasat, hogy a licit UI, admin route vedelem es felhasznaloi allapot ne localStorage-alapu szigetekbol epuljon.
