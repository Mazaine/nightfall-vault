# Nightfall Vault – Sprint 9 zárójelentés

Dátum: 2026-07-13

Verzió: `v0.9.0-dev`

Státusz: elkészült, ellenőrzött
Push: nem történt

## Összefoglaló

A Sprint 9 a meglévő marketplace felépítés megtartásával javította az aukciók kereshetőségét és a felhasználói navigációt. Elkészült a mentett keresés domain, a szabályalapú kapcsolódóaukció-szolgáltatás, az eladó további aukcióinak felülete, a kibővített profil-statisztika és az in-app mentettkeresés-értesítés. Fizetés, szállítás, Order-bővítés, VIP, előfizetés, chatbot, AI-ajánló és redesign nem készült.

## Kereső

A `GET /api/auctions` megőrizte a backend oldali `limit`/`offset` lapozást és a korábbi szűrőket. Új szöveges lehetőségek:

- `q`: cím, leírás, eladói felhasználónév vagy teljes név;
- `title`: cím;
- `description`: leírás;
- `seller`: eladói felhasználónév vagy teljes név.

A meglévő kategória-, termékállapot-, aukcióstátusz-, ár-, licitszám-, Buy Now-, hamarosan lejáró- és újaukció-szűrők változatlanul backend oldalon működnek. A frontend külön gyorskeresőt és célzott szöveges mezőket kapott.

## Mentett keresések

Új modell: `SavedSearch`. Az ownership mindig az aktuális hitelesített felhasználóból származik.

API-k:

- `POST /api/searches`;
- `GET /api/searches`;
- `DELETE /api/searches/{id}`.

Az idegen mentett keresés törlése `404` választ ad. A frontend `/saved-searches` oldala loading, empty és error állapotot, találati linket és törlési műveletet tartalmaz.

## Kapcsolódó aukciók és ajánlási logika

Új endpoint: `GET /api/auctions/{auction_id}/related`.

A pontozás determinisztikus és szabályalapú:

- azonos kategória: erős súly;
- közös, legalább három karakteres címszavak;
- azonos eladó;
- aktuális árak közelsége.

A forrásaukció nem szerepel a válaszban. Törölt vagy nem publikus jelölt nem jelenik meg. A jelöltlista legfeljebb 200 rekord, a válasz legfeljebb 12 rekord. AI vagy külső ajánlási szolgáltatás nincs.

## Eladó további aukciói

Új endpoint: `GET /api/auctions/{auction_id}/seller-auctions`.

A válasz csak a forrásaukció backend oldalon feloldott eladójának publikus, nem törölt aukcióit adja vissza. Önmagát kizárja, maximum 6 elemet küld. A blokk az aukció részletoldalán loading utáni empty állapotot is kezel.

## Profil és statisztikák

A publikus profil új, backend oldalon számolt mezői:

- követők száma;
- követett eladók száma;
- összes licit;
- sikeres licitek, vagyis megnyert lezárt aukciók;
- elvesztett licitek, vagyis licitált, más által megnyert aukciók;
- eladott aukciók;
- sikerességi arány a lezárt licitrészvételek alapján.

Jelentésszám és blokkolásszám nem publikus, és nem került a response sémába.

## Értesítések

Új típus: `saved_search_match`. Aukció aktiválásakor a backend értékeli a mentett kereséseket, és egyezéskor a mentés tulajdonosának készít értesítést. A user ID, auction ID és ownership nem frontend adatból származik. Ehhez a típushoz az emailküldés a hívásban és az email-policy rétegben is tiltott.

A követett eladó új aukciójának korábbi `seller_new_auction` értesítése megmaradt.

## Performance audit

Tényleges módosítások és megállapítások:

- az aukciólista kártyáihoz nem töltődnek elő chatüzenetek és review-k;
- az eladó és képek `selectinload` betöltést kapnak;
- a licitszám aggregált SQL-lekérdezésből érkezik;
- a kapcsolódó aukciók jelölt- és válaszmérete korlátozott;
- az eladó további aukciói adatbázisban limitáltak;
- a mentett keresésekhez `user_id` és `(user_id, created_at)` index készült;
- a publikus lista backend lapozása és maximum 100-as limitje megmaradt.

Nem készült indokolatlan általános cache vagy új infrastruktúra.

## Security audit

Ellenőrzött területek:

- Saved Search IDOR: idegen törlés `404`;
- related endpoint: draft forrásaukció anonim lekérése `404`;
- seller lookup: az eladó az aukció kapcsolatából származik;
- search injection: SQLAlchemy paraméterezés és wildcard escape; injekciós mintára nulla találat;
- notification manipulation: a címzett és aukció backend oldalon származtatott, automatikus email nincs;
- publikus profil: moderation count mezők nincsenek;
- related/seller válasz: forrás kizárása, publikus státusz és soft-delete szűrés.

## Alembic

Új migráció:

- `backend/alembic/versions/0009_saved_searches.py`;
- revision: `0009_saved_searches`;
- down revision: `0008_reports_and_user_blocks`.

A migráció létrehozza a `saved_searches` táblát és kibővíti a notification típus-constraintet. Korábbi migráció nem módosult.

## Dokumentációs technikai adósság

Auditált fájlok:

- `README.md`;
- `docs/PROJECT_STATUS.md`;
- `docs/SECURITY_AND_OPERATIONS.md`;
- `docs/SPRINT_8_REPORT.md`.

Mind a négy fájl érvényes UTF-8-ként olvasható. Javítva lett a `PROJECT_STATUS.md` három mojibake sora, két literális `` `r`n `` sortöréshiba, valamint a Sprint 8 ellenőrzési lista tördelése. A README dokumentumlistája Sprint 7–9 hivatkozásokkal bővült. Üzleti irány nem változott.

## Tesztek

Új tesztfájl: `backend/tests/test_sprint9_marketplace_ux.py`.

Lefedett esetek:

- mentett keresés auth, create, list, delete és IDOR;
- mentett keresés in-app értesítés;
- cím-, leírás- és eladókeresés;
- injekciós keresési minta;
- kapcsolódó aukciók és önkizárás;
- private/draft related endpoint védelem;
- seller lookup és maximum elemszám;
- követő-, eladási-, sikeres licit- és sikerességi statisztikák;
- moderation count privacy.

## Ténylegesen futtatott záró ellenőrzések

```powershell
docker compose up -d
docker compose ps
docker compose exec -T redis redis-cli ping
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic current
docker compose exec -T backend pytest
docker compose exec -T frontend npm run build
```

Eredmények:

- core szolgáltatások futnak;
- PostgreSQL és Redis healthy;
- Redis: `PONG`;
- Alembic: `0009_saved_searches (head)`;
- backend: `55 passed, 303 warnings in 46.70s`;
- frontend: TypeScript és Vite build sikeres, 86 modul transzformálva;
- Docker jelezte a korábbról megmaradt, healthy `postgres_restore` orphan konténert; a sprint nem törölte.

Külön célzott ellenőrzés is futott a végleges tesztesetekkel:

- Sprint 9 tesztfájl: `3 passed, 25 warnings`;
- frontend build: sikeres.

A warningok meglévő passlib, Pydantic és python-jose deprecation figyelmeztetések; teszthibát nem okoztak.

Git záró ellenőrzések is lefutottak:

- `git diff --cached --check`: hiba nélkül;
- `git status --short`: üres kimenet;
- `git diff`: üres kimenet;
- `git log --oneline --decorate -n 20`: lefutott, a Sprint 9 három logikus commitja a `main` ág tetején látható;
- push nem történt.

## Ismert technikai adósság

- A mentett keresések aktiváláskor szinkron módon értékelődnek; nagy felhasználói volumenhez queue/job alapú feldolgozás javasolt.
- A kapcsolódó aukciók szabályai alkalmazáskódban vannak; később konfigurálható súlyok és mérőszámok hasznosak lehetnek.
- A backend dependency audit Sprint 6-ban dokumentált csomagfrissítési adóssága továbbra is fennáll.
- A legacy Product/Order és frontend örökség továbbra is jelen van, de Sprint 9 nem bővítette.
- A korábbi aktív frontend egyes, Sprint 9-ben nem érintett oldalain még vannak karakterkódolási hibák; a részletoldal és jogi route-címek javítva lettek, teljes frontend-szövegaudit külön feladat.
- A healthy `postgres_restore` orphan konténer továbbra is létezik.

## Sprint 10 javaslat

Javasolt fókusz:

- mentettkeresés-értesítések aszinkron jobba szervezése és deduplikációja;
- ajánlási súlyok mérhetősége és konfigurálása AI nélkül;
- teljes aktív frontend UTF-8 szövegaudit;
- dependency remediation és ismételt dependency audit;
- a meglévő scheduler production worker/leader-election stratégiája;
- reszponzív és accessibility regressziós tesztek a marketplace oldalakon.

Fizetés, szállítás, Order domain, VIP és előfizetés csak külön üzleti döntés esetén kerülhet későbbi scope-ba; a marketplace-only alapelv változatlan.
