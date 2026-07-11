# Nightfall Vault - Projektallapot

Utolso frissites: 2026-07-11

## Project Version

v0.3.0-dev

Sprint 3 bid domain and transaction-safe bidding completed

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
- otperces hosszabbitas alapja bekerult: utolso 5 percben erkezo licit meghosszabbitja a zarast.

Tranzakciobiztonsag:

- a licit elhelyezese adatbazis tranzakcioban tortenik,
- az aukcio sorara row lock kerul (`SELECT ... FOR UPDATE`),
- a minimum licit ellenorzese es a highest bid frissitese egy tranzakcion belul tortenik,
- parhuzamos azonos osszegu liciteknel csak az egyik valhat ervenyes aktualis legmagasabb licitte.

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
- aktuális licit es licittortenet megjelenitese backend adatbol
- cim alapu aukcio navigacio
- chat es ertekeles megjelenites backend jogosultsagi flag alapjan
- login/register API bekotes az aktiv frontendben

## Current Technical Debt

- A frontend admin vedelem localStorage-alapu UX kapu; a valodi jogosultsagot tovabbra is a backend admin endpointjai ervenyesitik.
- A `Product` domain meg oroksegkent jelen van a backendben es a legacy frontend kodban.
- A licitmotor alapja elkeszult, de nincs WebSocket vagy push alapu valos ideju frissites.
- Az otperces hosszabbitas service-szinten mukodik licit elhelyezesekor, de kulon scheduler nincs.
- A buy now jelenleg elokeszitett jelzes, teljes azonnali zarasi folyamat kesobbi sprintre maradt.
- A frontend session kezeles meg nem teljes auth provider alapu alkalmazasarchitektura.
- Az admin aukcio moderacios UI meg nem teljes.

## Next Planned Sprint

A kovetkezo sprint celja a licitmotor felhasznaloi elmenyenek es operacios folyamatanak erositese: sajat licitek listaja, licitertesitesek, admin aukcio moderacio, buy now vegleges folyamat es idozitett lezaro job.

Sprint 4-ben kulon figyelmet kell kapnia annak, hogy a frontend session kezeles es az aukcio-frissitesek ne localStorage es kezi frissites alapu UX-re epuljenek hosszu tavon.
