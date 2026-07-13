# Nightfall Vault – Sprint 10 zárójelentés

Dátum: 2026-07-13

Verzió: `v0.10.0-dev`

Státusz: elkészült, ellenőrzött

Push: nem történt

## Összefoglaló

A Sprint 10 a meglévő marketplace működés megtartása mellett rendezte a fiókélményt, stabilizálta a fejlécet és a reszponzív navigációt, egységesítette a frontend állapot- és formkezelését, valamint bővítette a regressziós és üzemeltetési védőhálót. Fizetés, szállítás, Order-domain bővítés, VIP, előfizetés, chatbot, AI-ajánló és teljes vizuális redesign nem készült.

A sprint `636520c` (`docs: finalize sprint 9 marketplace UX`) commitról, tiszta munkafával indult. Adatmodell-változás nem történt, ezért új Alembic migráció nem készült.

## Account információs architektúra

A korábbi, több funkciót egyetlen oldalon keverő `/account` felület helyett közös, védett account layout készült:

- `/account/profile` – profilbeállítások;
- `/account/bids` – aktív, megnyert és elvesztett licitek;
- `/account/auctions` – aktív, piszkozat/időzített és lezárt saját aukciók;
- `/account/notifications` – értesítések és preferenciák;
- `/account/saved-searches` – mentett keresések;
- `/account/watchlist` – figyelőlista;
- `/account/reports` – saját jelentések;
- `/account/blocked-users` – blokkolt felhasználók.

A `/account`, `/notifications`, `/saved-searches` és `/watchlist` régi URL kompatibilis átirányítást kapott. A `/account/*` útvonalak közös `ProtectedRoute` mögött vannak; kijelentkezett direkt URL kérés a login oldalra irányít. Ez frontend UX-védelem, nem helyettesíti a backend ownership- és adminellenőrzéseket.

Az account oldalak közös loading/skeleton, empty, error és retry elemeket használnak. A licit- és aukciócsoportok képet, státuszt, licitszámot és a helyzethez illő műveletet jelenítenek meg. A képek natív lusta betöltést kaptak.

## Profilmenü és navigáció

A fejléc profilikonja most profilt célzó, hozzáférhető dropdown menüt nyit. Elkészült:

- kattintásos és billentyűzetes nyitás;
- Escape és külső kattintásos zárás;
- fókusz-visszaadás;
- megfelelő ARIA állapotok;
- hosszú felhasználónév levágása;
- külön licit és account navigáció;
- admin menüpont kizárólag admin session esetén.

A mobil/tablet hamburger menü backdropot, body scroll lockot, route-váltásos és Escape zárást, valamint fókusz-visszaadást kapott. A böngészős audit szerint 320, 375, 768, 1024, 1280 és 1440 px szélességen nincs vízszintes túlcsordulás. A kompakt menü 1280 px-ig, a teljes desktop navigáció 1440 px-en működött.

## Formok, szövegek és állapotok

Az aktív frontend forrás mojibake-auditja után a hibás karakterkódolású és a kapcsolódó ékezet nélküli magyar feliratok javítva lettek. A legacy könyvtár nem része ennek az auditnak.

Globális sötét stílus készült az input, select, option és textarea elemekhez, beleértve a hover, focus, autofill, disabled, readonly, error, success, checkbox és radio állapotokat. A tényleges böngészős ellenőrzésben a select kontroll sötét háttérrel és világos szöveggel jelent meg.

## Accessibility és böngészős audit

Elkészült a globális skip link, az account tartalomra mutató skip link és az egységes `focus-visible` kezelés. A menük szemantikus gombot, ARIA állapotot, Escape-kezelést és fókusz-visszaadást használnak.

Ténylegesen ellenőrzött böngészős esetek:

- 320–1440 px közötti reszponzív elrendezés és overflow;
- mobilmenü nyitás, backdrop, scroll lock és Escape;
- kijelentkezett direkt `/account/bids` kérés login redirectje;
- publikus aukcióoldal 320 px-en;
- route title és robots meta a publikus aukció- és login oldalon.

Valódi bejelentkezett böngészősession nem állt rendelkezésre, ezért az autentikált profilmenü és adminfeltétel komponens- és route-tesztekkel lett ellenőrizve. Teljes WCAG-megfelelőségi állítás, Firefox/Edge mátrix, kézi nagyítási audit és natív select-popup összehasonlítás nem történt.

## SEO és privát oldalak

Route-alapú title és robots meta kezelés készült. Az account, admin, auth, checkout és order útvonalak `noindex, nofollow` értéket kapnak. A `robots.txt` tiltja a privát route-családokat. A sitemapből kikerült a fiktív example origin; production sitemaphez valódi publikus origin szükséges.

A publikus marketplace oldalak indexelhetők maradtak. A fizetésre utaló kezdőlapi szöveg a jelenlegi piactérmodellhez lett igazítva.

## Frontend performance és cache

Az account- és adminoldalak route-szintű dinamikus importot kaptak. A záró buildben 93 modul készült; a fő JavaScript bundle 293,48 kB, gzipelve 90,70 kB lett. Az account oldal külön 12,44 kB-os chunkban található. A sprint eleji összehasonlításban a fő bundle körülbelül 321,79 kB volt.

Az Authorization headert használó és az ismert privát frontend kérések `cache: no-store` beállítást kapnak. A backend auth/privát válaszai `Cache-Control: no-store, private`, `Pragma: no-cache` és `Vary: Authorization` headereket adnak. Logout és session-expired esemény törli a központi token- és user-state-et; külön account cache nincs.

## Security audit

Ellenőrzött területek:

- account route guard és direkt URL viselkedés;
- admin menüpont láthatósága és backend admin dependency megőrzése;
- auction/bid/report/block ownership és privacy meglévő backend tesztjei;
- privát válaszok cache-védelme;
- publikus profil adatminimalizálása;
- React text escaping és az aktív frontendben a `dangerouslySetInnerHTML` hiánya;
- secret- és környezeti konfiguráció dokumentációja.

A JWT session továbbra is localStorage-alapú és refresh token nincs; ez örökölt technikai adósság. A frontend guard nem biztonsági határ, a jogosultsági döntés minden esetben a backend feladata.

## Tesztinfrastruktúra

A frontend Vitest, Testing Library és jsdom alapot kapott. Két tesztfájlban kilenc regressziós teszt ellenőrzi többek között:

- kijelentkezett és bejelentkezett fejlécállapotot;
- profil dropdown nyitását és Escape-zárását;
- admin menüpont feltételét;
- privát route guardot;
- account loading, empty, csoportosított és retry állapotokat.

A backend cache-változáshoz célzott operations-readiness teszt készült. A teljes backend suite záró eredménye `55 passed, 1 warning`.

## Dependency audit

A kezdő backend `pip-audit` 32 ismert találatot jelzett 6 csomagban. Frissítve lett:

- `python-jose` 3.4.0-ra;
- `python-multipart` 0.0.31-re;
- `Pillow` 12.3.0-ra.

Az ismételt audit 11 találatot jelzett 4 csomagban:

- `pytest 8.3.4`: a javítás 9.0.3, külön major kompatibilitási lépés szükséges;
- `pyasn1 0.4.8`: a javító verzió ütközik a jelenlegi python-jose korlátozásával;
- `starlette 0.41.3`: a jelölt javító verziók nem kompatibilisek a jelenlegi `fastapi==0.115.6` korlátozásával;
- `ecdsa 0.19.2`: az audit nem jelölt javító verziót.

A frontend `npm audit` eredménye 0 ismert sérülékenység. A backend tesztwarningok száma 303-ról 1-re csökkent; a megmaradt figyelmeztetés külső passlib/Python `crypt` deprecation.

## CI, Docker és üzemeltetés

Minimális GitHub Actions workflow készült, amely Docker Compose környezetet készít, Alembic migrációt, backend pytestet, frontend tesztet és production buildet futtat, hiba esetén pedig logokat gyűjt.

A backend és frontend `.dockerignore` fájlt, a frontend image determinisztikus `npm ci` telepítést kapott. A Compose backend- és frontend-healthchecket használ, a frontend a healthy backendtől függ. A meglévő live/ready endpointok, request ID és production logolás megmaradt. Teljes metrics/alerting platform nem készült; production környezetben uptime monitor, error tracking és metrikaexport javasolt.

A backup script ellenőrzi a futtatott parancsokat, az üres dumpot és a régi mentések takarítását. A mentési és izolált visszaállítási eljárást a `docs/BACKUP_AND_RESTORE.md` dokumentálja. Tényleges backup/restore próba nem futott a Sprint 10-ben; a korábbról megmaradt healthy `postgres_restore` orphan konténer érintetlen maradt.

## Alembic

Adatmodell-változás nem történt. Új migráció nem készült, meglévő migráció nem módosult. A záró revision:

```text
0009_saved_searches (head)
```

## Ténylegesen futtatott záró ellenőrzések

```powershell
docker compose build frontend
docker compose up -d --wait
docker compose ps
docker compose exec -T redis redis-cli ping
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic current
docker compose exec -T backend pytest
docker compose exec -T frontend npm run test
docker compose exec -T frontend npm run build
docker compose config --quiet
git diff --cached --check
git diff --check
git status --short
git log --oneline --decorate -n 20
```

Eredmények:

- PostgreSQL, Redis, backend és frontend fut, mind healthy;
- Redis: `PONG`;
- Alembic: `0009_saved_searches (head)`;
- backend: `55 passed, 1 warning in 42.03s`;
- frontend: 2 fájl, 9 teszt sikeres;
- frontend production build: 93 modul, fő JS 293,48 kB, gzip 90,70 kB;
- frontend image `npm ci`: 0 vulnerability;
- Docker Compose konfiguráció érvényes;
- a whitespace/diff ellenőrzések hibamentesek;
- a healthy `postgres_restore` orphan konténer megmaradt;
- push nem történt.

## Sprint commitok

- `a6b1b70` – `docs: initialize sprint 10 progress tracking`;
- `709dc83` – `fix: repair remaining frontend encoding issues`;
- `6496017` – `fix: unify dark theme form controls`;
- `cb06e1a` – `feat(frontend): organize account navigation and UX`;
- `ceccd25` – `test(frontend): cover account navigation states`;
- `efcdd5f` – `perf(frontend): split account routes and protect private cache`;
- `ecd039b` – `chore(ops): harden dependencies ci and backups`.

A záró dokumentációt tartalmazó commit a riporttal együtt készül; push nem történik.

## Ismert technikai adósság

- A JWT session localStorage-alapú, refresh token nincs.
- A scheduler in-process; több backend replika esetén külön worker vagy leader election szükséges.
- A production canonical origin és sitemap nincs konfigurálva.
- Négy backend dependencyben 11 audit-találat maradt, amelyek kompatibilis stackfrissítést igényelnek.
- A passlib/Python `crypt` deprecation warning megmaradt.
- A healthy `postgres_restore` orphan konténer megmaradt.
- Teljes böngészőmátrix, bejelentkezett kézi vizuális audit és restore-próba külön ellenőrzési feladat.

## Sprint 11 javaslat

Javasolt fókusz a FastAPI/Starlette és JWT dependency stack kompatibilis frissítése, a scheduler külön workerre szervezése, production origin/sitemap és monitoring integráció, valamint a moderációs UX és report SLA/riporting továbbfejlesztése. Fizetés, szállítás, Order-domain, VIP és előfizetés csak külön üzleti döntéssel kerüljön scope-ba.
