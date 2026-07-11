# Nightfall Vault - Projektallapot

Utolso frissites: 2026-07-11

## Project Version

v0.2.0-dev

Sprint 2 backend domain completed, frontend integration partially completed

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
- cim alapu aukcio navigacio
- chat es ertekeles megjelenites backend jogosultsagi flag alapjan
- login/register API bekotes az aktiv frontendben

## Current Technical Debt

- A frontend admin vedelem localStorage-alapu UX kapu; a valodi jogosultsagot tovabbra is a backend admin endpointjai ervenyesitik.
- A `Product` domain meg oroksegkent jelen van a backendben es a legacy frontend kodban.
- A teljes licitmotor, Bid modell es licittortenet meg nem keszult el.
- A nyertes automatikus meghatarozasa es otperces hosszabbitas tenyleges vegrehajtasa Sprint 3-ra maradt.
- A frontend session kezeles meg nem teljes auth provider alapu alkalmazasarchitektura.
- Az admin aukcio moderacios UI meg nem teljes.

## Next Planned Sprint

A kovetkezo sprint celja a licitmotor es Bid domain kialakitasa: licitalasi tranzakciok, licittortenet, konkurenciakezeles, automatikus lezaras es nyertes-meghatarozas. Ez a Sprint 2-ben letrehozott Auction eletciklusra epuljon.

Sprint 3-ban kulon figyelmet kell kapnia annak, hogy a licitalas tranzakciobiztos legyen, ne alakuljon ki versenyhelyzetbol adatinkonzisztencia, es az automatikus nyertes-meghatarozas ne legyen frontendrol manipulalhato.
