# 🌑 Nightfall Vault

> **Modern, teljes értékű aukciós platform React, FastAPI és Docker technológiákkal.**

A **Nightfall Vault** egy hosszú távú full-stack fejlesztési projekt, amelynek célja egy modern, biztonságos és skálázható aukciós platform létrehozása.

A projekt egyszerre szolgál:

* tanulási projektként,
* szakmai portfólióként,
* valamint egy később akár éles környezetben is használható webalkalmazás alapjaként.

A fejlesztés sprintenként, részletes dokumentációval és professzionális szoftverfejlesztési szemlélettel történik.

---

# 🎯 Célkitűzés

A Nightfall Vault célja egy olyan aukciós rendszer elkészítése, amely:

* modern felhasználói élményt nyújt,
* biztonságos,
* könnyen bővíthető,
* mobilbarát,
* többnyelvű (magyar / angol),
* Docker-alapú fejlesztési környezetet használ.

---

# 🛠 Technológiai stack

## Frontend

* React
* TypeScript
* Vite
* React Router

## Backend

* FastAPI
* SQLAlchemy
* PostgreSQL
* Alembic
* JWT hitelesítés

## Infrastruktúra

* Docker
* Docker Compose

---

# 📁 Projekt felépítése

```text
Nightfall-Vault/
│
├── frontend/
├── backend/
├── docs/
├── .github/
├── docker-compose.yml
├── .env.example
├── README.md
└── README_EN.md
```

---

# 🚧 Projekt állapota

A projekt aktív aukciós platformként fejlődik. A jelenlegi fókusz:

* felhasználói aukciók létrehozása,
* licitek követése,
* admin felület,
* biztonságos local/dev környezet,
* mobil- és tabletbarát frontend.

---

# 📋 Tervezett funkciók

## Felhasználók

* Regisztráció
* Bejelentkezés
* Jelszó-visszaállítás
* E-mail megerősítés
* Jogosultsági rendszer

## Aukció

* Aukció létrehozása
* Önálló Auction domain
* Aukcióállapot-életciklus
* Képfeltöltés és borítókép
* Eladói nyilatkozat
* Sikeresen lezárt aukcióhoz kötött chat
* Eladó és nyertes közötti értékelés
* Licitálás önálló Bid domainnel
* Tranzakcióbiztos licitmotor
* Automatikus lezárás licit alapján
* Licittörténet
* Minimum ár
* Azonnali vásárlás lehetősége

## Felhasználói funkciók

* Profil
* Kedvencek
* Figyelőlista
* Értesítések
* Vásárlási előzmények

## Admin felület

* Irányítópult
* Felhasználókezelés
* Aukciók kezelése
* Riportok
* Rendszerbeállítások

---

# 📚 Dokumentáció

A projekt dokumentációja aktív állapot- és sprintdokumentumokba van rendezve:

* `docs/PROJECT_STATUS.md` – aktuális projektállapot és funkciók
* `docs/SECURITY_AND_OPERATIONS.md` – secret kezelés, Docker, local/dev admin, üzemeltetés
* `docs/SPRINT_1_REPORT.md` – Sprint 1 részletes zárójelentés
* `docs/SPRINT_2_REPORT.md` – Auction domain zárójelentés
* `docs/SPRINT_3_REPORT.md` – Bid domain és licitmotor zárójelentés
* `docs/SPRINT_4_REPORT.md` – valós idejű licitfrissítés, értesítések és Buy Now zárójelentés
* `docs/SPRINT_5_REPORT.md` – production readiness, notification center, watchlist és moderáció zárójelentés
* `docs/SPRINT_6_REPORT.md` – üzemeltetési felkészítés, monitoring, média és email zárójelentés
* `docs/SPRINT_7_REPORT.md` – publikus profilok, követések és aukciókeresés zárójelentés
* `docs/SPRINT_8_REPORT.md` – Trust & Safety, jelentések és blokkolás zárójelentés
* `docs/SPRINT_9_REPORT.md` – marketplace UX, mentett keresések és ajánlások zárójelentés

---

# 💡 Fejlesztési alapelvek

A projekt fejlesztése során kiemelt szempont:

* tiszta architektúra,
* kis lépésekben történő fejlesztés,
* jól olvasható kód,
* újrafelhasználható komponensek,
* biztonságközpontú szemlélet,
* Mobile First megközelítés,
* akadálymentesség,
* folyamatos dokumentáció.

---

# 📄 Licenc

A projekt jelenleg aktív fejlesztés alatt áll.

A licenc az első nyilvános kiadás előtt kerül meghatározásra.

---

# 🔐 Secret kezelés és local admin

A repository nem tartalmazhat valódi jelszót, API-kulcsot vagy éles secretet. A .env fájlok ignorálva vannak, a .env.example fájlok csak példaértékeket tartalmazhatnak.

Local admin létrehozása kizárólag környezeti változóval történhet. A seed script nem tartalmaz és nem ír ki jelszót.

Részletes útmutató: `docs/SECURITY_AND_OPERATIONS.md`.

---

# 🧩 Auction domain fejlesztői parancsok

Migráció futtatása:

```powershell
docker compose exec -T backend alembic upgrade head
```

Backend tesztek:

```powershell
docker compose exec -T backend pytest
```

Frontend build:

```powershell
docker compose exec -T frontend npm run build
```

Docker állapot:

```powershell
docker compose ps
```

## Képtárolás

Az aukcióképek local/dev környezetben az alkalmazás `uploads/auctions` könyvtárába kerülnek, biztonságosan generált storage kulccsal. Egy aukcióhoz maximum 5 kép tartozhat, aktiváláskor pontosan 1 borítókép szükséges.

## Bid domain és licitmotor

Sprint 3-tól az aktív aukciókra valós backend licit helyezhető el.
Sprint 4-től a villámáras licit lezárja az aukciót, a lejárt aktív aukciókat háttérfolyamat zárja, és az aukció részletoldal SSE streamen kap frissítést.

Fő szabályok:

* csak bejelentkezett felhasználó licitálhat;
* saját aukcióra nem lehet licitálni;
* licit csak `active` aukción fogadható;
* a minimum licit `current_price + bid_increment`;
* a `current_price`, `highest_bid` és nyertes meghatározása backend oldalon történik;
* a licittörténet publikus, de a licitáló anonim címkével jelenik meg;
* a licitmotor adatbázis tranzakciót és row lockingot használ.
* sikeres villámár esetén az aukció `sold` állapotba kerül és a nyertes backend oldalon rögzül;
* az utolsó 5 percben érkező licit meghosszabbítja az aukciót;
* a korábbi legmagasabb licitáló outbid értesítést kap;
* a "Licitjeim" oldal backend endpointból kapja a felhasználó licitált aukcióit.

Kapcsolódó endpointok:

```text
POST /api/auctions/{auction_id}/bids
GET  /api/auctions/{auction_id}/bids
GET  /api/auctions/{auction_id}/stream
GET  /api/auctions/my-bids
GET  /api/auctions/notifications
GET  /api/notifications
GET  /api/watchlist
GET  /api/admin/auctions
```

## Session es frontend auth

Sprint 4-tol a frontend token- es felhasznaloi allapotkezeles kozponti AuthProvideren keresztul tortenik. A localStorage hasznalata egy helyre lett szukitve, a route vedelem es navbar allapot innen olvas.
Sprint 5-tol a frontend API kliens 401 valasznal session-expired esemenyt kuld, az AuthProvider pedig automatikusan torli a local sessiont.

## Production readiness

Sprint 5-ben bekerult a Notification Center, Watchlist, admin aukcio moderacio, soft delete, domain audit log alap, FastAPI lifespan handler es production-ready scheduler szervezes.


## Sprint 6 operational readiness

Sprint 6-ban bekerült a request ID alapú hibakövetés, a health/readiness/liveness endpoint készlet, az admin Audit Log API és frontend oldal, a felhasználói értesítési beállítások, a képfeldolgozási variánsok és a jelszómentes backup/restore script alap.

Email küldés biztonságosan két kapcsolóval működik:

```text
EMAIL_DELIVERY_ENABLED=false
NOTIFICATION_EMAIL_ENABLED=false
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
```

A Brevo API kulcs önmagában nem indít email küldést. Local/dev környezetben az email delivery alapértelmezetten tiltott, élesítés előtt külön kell engedélyezni és ellenőrizni.

Backup készítés:

```powershell
.\scripts\backup_database.ps1
```

Restore próba külön adatbázisba:

```powershell
docker compose -f docker-compose.yml -f docker-compose.restore.yml --profile restore up -d postgres_restore
.\scripts\restore_database.ps1 -BackupFile "backups\nightfall-vault-YYYYMMDD-HHMMSS.dump" -TargetDatabase nightfall_vault_restore_test -ComposeService postgres_restore -ComposeFiles docker-compose.yml,docker-compose.restore.yml -ConfirmRestore
```

A javasolt local restore validáció izolált `postgres_restore` service-t használ, így nem kell az aktív dev PostgreSQL role jogosultságait bővíteni.
## Fontos konfigurációs változónevek

Az értékeket `.env` fájlban kell megadni, de valódi secret nem kerülhet verziókezelésbe.

```text
DATABASE_URL
SECRET_KEY
REDIS_URL
CAPTCHA_ENABLED
TURNSTILE_SECRET_KEY
BREVO_API_KEY
DEV_ADMIN_EMAIL
DEV_ADMIN_PASSWORD
VITE_API_BASE_URL
```

## Sprint 7 public profiles and reputation

Sprint 7-ben bekerult a piacteri bizalmi reteg:

- publikus felhasznaloi profil: `GET /api/users/{username}`;
- publikus user review lista lapozassal: `GET /api/users/{username}/reviews`;
- aukcio review lista lapozassal es rendezessel: `GET /api/auctions/{auction_id}/reviews`;
- elado kovetes: `POST /api/follow`, `DELETE /api/follow`, `GET /api/following`;
- aukciokereso kategoriaval, allapottal, arral, licitszammal, villamarral, hamarosan lejaro es uj aukcio szurokkel;
- rendezes: legujabb, legregebbi, legmagasabb ar, legalacsonyabb ar, legtobb licit, legkevesebb licit, hamarosan lejar, villamar elore;
- frontend publikus profiloldal es kattinthato eladoi profil linkek.

A publikus profil nem ad vissza emailt, admin statuszt, belso user ID-t, notification preference-t vagy audit adatot.

## Sprint 8 Trust & Safety

Sprint 8-ban bekerult a marketplace biztonsagi es moderacios retege:

- egyseges Report domain aukcio- es felhasznaloi jelentesekhez;
- publikus report endpointok: `POST /api/reports/auctions/{auction_id}`, `POST /api/reports/users/{username}`, `GET /api/reports/me`, `GET /api/reports/me/{report_id}`;
- admin report queue: `GET /api/admin/reports`, `GET /api/admin/reports/{report_id}`, statusz-, prioritas- es jegyzetfrissites;
- UserBlock domain: `POST /api/blocks/{username}`, `DELETE /api/blocks/{username}`, `GET /api/blocks`, `GET /api/blocks/{username}/status`;
- blokkolas hatasa: uj chat uzenet es kovetes tiltasa, a regi uzenetek es aukcios eredmenyek valtozatlanul megmaradnak;
- report es block audit logok erzekeny reszletek es admin note nelkul;
- frontend profil jelentese/blokkolasa, aukcio jelentese, sajat jelenteseim, blokkolt felhasznalok es admin jelentessor.

A felhasznalo nem allithat report prioritasitast, nem jelentheti sajat aukciojat vagy sajat profiljat, es ugyanarra a celra nem kuldhet duplikalt nyitott jelentest.

## Sprint 9 Marketplace UX

Sprint 9-ben kibővült a backend oldalon lapozott aukciókeresés cím-, leírás- és eladókereséssel. A bejelentkezett felhasználó mentett kereséseket hozhat létre, listázhat és törölhet; az új találatokról csak alkalmazáson belüli értesítés készül.

Új API-k:

```text
POST   /api/searches
GET    /api/searches
DELETE /api/searches/{id}
GET    /api/auctions/{auction_id}/related
GET    /api/auctions/{auction_id}/seller-auctions
```

A kapcsolódó aukciók szabályalapú pontozása a kategóriát, a cím közös szavait, az eladót és az árközelséget használja. Nem AI-alapú ajánlórendszer.
