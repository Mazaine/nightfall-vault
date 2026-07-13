# Nightfall Vault – Sprint 10 progress

Utolsó frissítés: 2026-07-13

Állapotjelölések: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

## Feladatlista

- `DONE` 10.1 Kezdő audit: dokumentáció, Git, route-ok, account UX, navbar, auth, formok, teszt/CI/Docker.
- `DONE` 10.2 Aktív frontend UTF-8 és mojibake audit, tényleges hibák javítása.
- `DONE` 10.3 Globális sötét form-, select-, autofill-, focus-, disabled- és error-stílus.
- `DONE` 10.4 Account információs architektúra, védett `/account/*` route-ok és kompatibilis redirectek.
- `DONE` 10.5 Profilikon, hozzáférhető felhasználói dropdown és adminfeltétel.
- `DONE` 10.6 Bejelentkezett navbar stabilizálása desktop/tablet/mobil nézetben.
- `DONE` 10.7 Licitjeim és Saját aukcióim UX: aktív/nyert/elvesztett, státuszok, műveletek és lapozás auditja.
- `DONE` 10.8 Újrafelhasználható loading, skeleton, empty, error és retry állapotok.
- `DONE` 10.9 Profilbeállítások és publikus profil privacy/UX audit.
- `IN PROGRESS` 10.10 Accessibility audit és indokolt javítások.
- `DONE` 10.11 SEO, route title, robots/noindex és sitemap audit.
- `TODO` 10.12 Képkezelési és frontend performance audit.
- `TODO` 10.13 Frontend/cache stratégia audit és auth-váltás utáni állapottisztítás.
- `TODO` 10.14 Security audit, account/admin/ownership/privacy ellenőrzések.
- `DONE` 10.15 Frontend tesztinfrastruktúra audit és fenntartható regressziós tesztek.
- `TODO` 10.16 Backend célzott tesztek, ha backend változik.
- `TODO` 10.17 CI/CD audit és szükség esetén minimális workflow.
- `TODO` 10.18 Docker és production hardening audit.
- `TODO` 10.19 Backup/restore audit és `docs/BACKUP_AND_RESTORE.md`.
- `TODO` 10.20 Monitoring/health/logging audit.
- `TODO` 10.21 Dependency warning audit és kategorizálás.
- `TODO` 10.22 Alembic döntés dokumentálása; migráció csak valós adatmodell-változásnál.
- `TODO` 10.23 README, projektállapot, biztonsági dokumentáció és Sprint 10 riport.
- `TODO` 10.24 Teljes záró Docker, Redis, Alembic, pytest, frontend build és Git ellenőrzés.

## Kezdő audit – eddigi megállapítások

- Aktív projekt: `C:\Users\Eszti\Desktop\nightfall-vault`; más projekt nem módosítandó.
- Kiinduló HEAD: `636520c` (`docs: finalize sprint 9 marketplace UX`).
- A munkafa, index és diff a sprint kezdetén tiszta volt.
- Aktuális Alembic head a Sprint 9 riport alapján: `0009_saved_searches`.
- A jelenlegi account felület egyetlen `/account` route-on keveri a liciteket, saját aukciókat, létrehozást, értesítési preferenciákat, reportokat és blokkolásokat.
- A `/notifications`, `/watchlist` és `/saved-searches` külön route, de nincs egységes account navigáció és a route-oknak nincs közös auth guardja.
- A profilikon és a felhasználónév jelenleg hibásan `/account` (Licitjeim) célra vezet.
- A header túl sok külön account műveletet jelenít meg, köztes szélességen zsúfolódási kockázattal.
- A mobil menü nem kezel Escape-et, külső kattintást, route-váltást, body scrollt és fókusz-visszaadást.
- Frontend `package.json`: csak `dev`, `build`, `preview`; lint és teszt script nincs.
- `.github/workflows` jelenleg nem tartalmaz workflow-t.
- Docker Compose a négy core service-t tartalmazza; a korábbi healthy `postgres_restore` orphan örökölt tétel, nem törlendő.

## Utoljára befejezett konkrét lépés

Az account felület védett `/account/*` struktúrára váltott közös reszponzív navigációval. Elkészült a profil dropdown, a külön Licitjeim/Saját aukcióim oldal, a státuszcsoportok, az egységes async állapotok, a régi URL redirect, a route meta/noindex kezelés és a minimális frontend tesztalap.

## Éppen módosított fájlok

- `docs/SPRINT_10_PROGRESS.md`
- `frontend/src/pages/AccountPage.tsx`
- `frontend/src/styles/base/global.css`
- `frontend/src/App.tsx`, `frontend/src/components/AccountLayout.tsx`, `frontend/src/components/AsyncStates.tsx`
- `frontend/src/components/SiteHeader.tsx`, `frontend/src/components/SiteHeader.css`, `frontend/src/components/AuctionCard.tsx`
- `frontend/src/pages/Account*.tsx`, `NotificationsPage.tsx`, `SavedSearchesPage.tsx`, `WatchlistPage.tsx`
- `frontend/package.json`, `frontend/package-lock.json`, `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`
- `frontend/index.html`, `frontend/public/robots.txt`, `frontend/public/sitemap.xml`

## Már lefuttatott ellenőrzések

- `git -c safe.directory=C:/Users/Eszti/Desktop/nightfall-vault -C C:/Users/Eszti/Desktop/nightfall-vault status --short` – tiszta.
- `git ... diff --stat` – üres.
- `git ... diff --cached --stat` – üres.
- `git ... log --oneline --decorate -n 20` – HEAD `636520c`.
- Projektfájl-, route-, package-, Compose-, header-, auth- és account-kód audit – folyamatban, első kör kész.
- `rg -n --glob '!src/_legacy/**' 'Ã|Å|Ä|Â|�|Ă|Ĺ|â' frontend/src frontend/index.html frontend/public` – a javítás után nincs találat.
- `docker compose exec -T frontend npm run build` – sikeres, 86 modul transzformálva (UTF-8 javítás után).
- `docker compose exec -T frontend npm run build` – sikeres, 92 modul transzformálva (account/SEO/tesztalap után).
- `docker compose exec -T frontend npm run test` – 2 fájl, 9 teszt sikeres.
- Böngészős audit 320, 375, 768, 1024, 1280 és 1440 px nézetben: nincs vízszintes overflow.
- Mobilmenü: nyitás, `aria-expanded`, body scroll lock, Escape és fókusz-visszaadás sikeres.
- Kijelentkezett `/account/bids` direkt URL: `/login` redirect sikeres.
- Bejelentkezett dropdown/admin viselkedés automatizált komponens- és route-teszttel ellenőrzött; valódi böngészős bejelentkezett session nem állt rendelkezésre.

## Hátralévő ellenőrzések

- Minden jelentős frontend változtatás után frontend build, `git diff --check`, státusz.
- Elérhető frontend tesztek, ha fenntartható tesztalap készül.
- Teljes backend pytest és warning-számlálás.
- Docker Compose, Redis PONG, Alembic upgrade/current.
- Végső diff, staged diff és Git log ellenőrzés.
- Tényleges böngészős/reszponzív ellenőrzés, ha a környezetben elérhető; egyébként manuális checklist.

## Ismert hibák

### Sprint 10 előtt már létező

- 303 dependency/deprecation warning a Sprint 9 zárásakor.
- Healthy `postgres_restore` orphan konténer.
- Aktív frontendben a Sprint 10 előtt több mojibake/ékezet nélküli magyar szöveg volt; a mojibake-rész javítva, az ékezet nélküli copy finomítása a kapcsolódó komponensekkel együtt folytatódik.
- Account route-ok és privát oldalak egységes guard/navigáció nélkül.
- Auth session localStorage-alapú; refresh token nincs.

### Sprint 10 alatt talált

- Profilikon hibás célroute-ja.
- Header account műveleteinek zsúfolt szerkezete és hiányos mobil/fókusz viselkedése.
- Az account oldal hibáknál több helyen üres listára esik vissza, így nincs valódi error/retry állapot.
- Frontend lint és tesztinfrastruktúra nincs.

### Sprint 10 által okozott regressziók

- Jelenleg nincs ismert regresszió.

## Legutóbbi elkészült commit

`6496017` – `fix: unify dark theme form controls`.

## Következő lépés

Az account/navigáció/teszt módosítások diff-auditja és logikus commitjai; ezután performance, cache, security, CI/Docker/monitoring és üzemeltetési dokumentáció auditja.
