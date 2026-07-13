# Nightfall Vault – Sprint 10 progress

Utolsó frissítés: 2026-07-13

Állapotjelölések: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

## Feladatlista

- `IN PROGRESS` 10.1 Kezdő audit: dokumentáció, Git, route-ok, account UX, navbar, auth, formok, teszt/CI/Docker.
- `TODO` 10.2 Aktív frontend UTF-8 és mojibake audit, tényleges hibák javítása.
- `TODO` 10.3 Globális sötét form-, select-, autofill-, focus-, disabled- és error-stílus.
- `TODO` 10.4 Account információs architektúra, védett `/account/*` route-ok és kompatibilis redirectek.
- `TODO` 10.5 Profilikon, hozzáférhető felhasználói dropdown és adminfeltétel.
- `TODO` 10.6 Bejelentkezett navbar stabilizálása desktop/tablet/mobil nézetben.
- `TODO` 10.7 Licitjeim és Saját aukcióim UX: aktív/nyert/elvesztett, státuszok, műveletek és lapozás auditja.
- `TODO` 10.8 Újrafelhasználható loading, skeleton, empty, error és retry állapotok.
- `TODO` 10.9 Profilbeállítások és publikus profil privacy/UX audit.
- `TODO` 10.10 Accessibility audit és indokolt javítások.
- `TODO` 10.11 SEO, route title, robots/noindex és sitemap audit.
- `TODO` 10.12 Képkezelési és frontend performance audit.
- `TODO` 10.13 Frontend/cache stratégia audit és auth-váltás utáni állapottisztítás.
- `TODO` 10.14 Security audit, account/admin/ownership/privacy ellenőrzések.
- `TODO` 10.15 Frontend tesztinfrastruktúra audit és fenntartható regressziós tesztek.
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

A kötelező Sprint 1–9 előzmények, az aktív route-ok, account/header/auth alapok, package scriptek és Docker Compose kezdő auditja megtörtént; a progress napló létrejött.

## Éppen módosított fájlok

- `docs/SPRINT_10_PROGRESS.md`

## Már lefuttatott ellenőrzések

- `git -c safe.directory=C:/Users/Eszti/Desktop/nightfall-vault -C C:/Users/Eszti/Desktop/nightfall-vault status --short` – tiszta.
- `git ... diff --stat` – üres.
- `git ... diff --cached --stat` – üres.
- `git ... log --oneline --decorate -n 20` – HEAD `636520c`.
- Projektfájl-, route-, package-, Compose-, header-, auth- és account-kód audit – folyamatban, első kör kész.

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
- Aktív frontendben több mojibake/ékezet nélküli magyar szöveg.
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

`636520c` – a Sprint 10 előtti kiinduló commit; Sprint 10 commit még nem készült.

## Következő lépés

A teljes aktív frontend UTF-8/mojibake keresés befejezése, a valódi hibák javítása, build és első funkcionális Sprint 10 commit.
