# Nightfall Vault - Projektallapot

Utolso frissites: 2026-07-11

## Project Version

v0.1.0-dev

Sprint 1 completed

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

## Current Technical Debt

- Az aukcio letrehozo frontend form jelenleg UI szintu, a vegleges aukcio API bekotes kesobb szukseges.
- A frontend admin vedelem localStorage-alapu UX kapu; a valodi jogosultsagot tovabbra is a backend admin endpointjai ervenyesitik.
- Az Alembic jelenleg egy kezdeti migraciot tartalmaz.
- A `Product` domain meg oroksegkent jelen van a backendben es a legacy frontend kodban.
- Az aukcio backend domain, adatmodell, kepfeltoltes es licitlogika meg nem teljesen bekotott.
- A kepfeltoltes jelenleg frontend UI allapot, nem perzisztalt backend workflow.
- A frontend session kezeles meg nem teljes auth provider alapu alkalmazasarchitektura.

## Next Planned Sprint

A kovetkezo sprint celja az aukcios domain backend oldali megalapozasa: adatmodell, API szerzodesek, aukcio letrehozas, kepfeltoltes, boritokep kezeles es jogosultsagi szabalyok. A fejlesztesnek a marketplace iranyt kell erositenie, a megmaradt webshop/product orokseg tovabbi terjedese nelkul.

Sprint 2-ben kulon figyelmet kell kapnia a felhasznaloi tulajdonjognak, a licitalasi szabalyoknak, a lezart aukciok 24 oras lathatosaganak, valamint annak, hogy az admin funkciok backend jogosultsaggal vedettek maradjanak.
