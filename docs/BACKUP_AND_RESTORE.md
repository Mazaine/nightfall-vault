# Nightfall Vault – Backup és visszaállítás

Utolsó audit: 2026-07-13 (Sprint 10)

## Hatókör

A PostgreSQL adatbázis, a local képtárolás és a nem érzékeny konfiguráció együtt alkot helyreállítható mentést. A `backups/`, `.env`, adatbázis-dump, token, API-kulcs és jelszó nem kerülhet Gitbe.

## PostgreSQL backup

A core szolgáltatások indítása és állapotellenőrzése:

```powershell
docker compose up -d
docker compose ps
```

Mentés custom PostgreSQL formátumba:

```powershell
.\scripts\backup_database.ps1
```

A script a futó `postgres` konténerből a gitignore alatt tartott `backups/` könyvtárba másolja a dumpot. A kimeneti fájlt védeni, titkosított külső tárhelyre másolni és megőrzési szabály szerint rotálni kell.

## Migráció előtti mentés

Éles vagy fontos local adatbázison Alembic upgrade előtt:

```powershell
.\scripts\backup_database.ps1
docker compose exec -T backend alembic current
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic current
```

A backup fájl létét és nem nulla méretét ellenőrizni kell a migráció indítása előtt. A mentés használhatóságát csak izolált restore próba igazolja.

## Izolált restore teszt

A meglévő fejlesztői adatbázis helyett külön restore service használandó:

```powershell
docker compose -f docker-compose.yml -f docker-compose.restore.yml --profile restore up -d postgres_restore
docker compose -f docker-compose.yml -f docker-compose.restore.yml ps
.\scripts\restore_database.ps1 `
  -BackupFile "backups\nightfall-vault-YYYYMMDD-HHMMSS.dump" `
  -TargetDatabase nightfall_vault_restore_test `
  -ComposeService postgres_restore `
  -ComposeFiles docker-compose.yml,docker-compose.restore.yml `
  -ConfirmRestore
```

A `-ConfirmRestore` kapcsoló kötelező. A `TargetDatabase` ne legyen az aktív alkalmazás-adatbázis. A restore script eldobja és újralétrehozza a megadott céladatbázist, ezért a cél nevét futtatás előtt kétszer ellenőrizni kell.

Sprint 10-ben tényleges restore próba nem futott. A korábbi sprintekből megmaradt healthy `postgres_restore` orphan konténert a Sprint 10 nem törölte és nem módosította.

## Local képtárolás mentése

A backend local storage esetén az aukcióképek alapértelmezett helye `backend/uploads/`. Az adatbázis-dump önmagában nem tartalmazza a fájlokat.

Mentendő:

- eredeti aukcióképek;
- thumbnail/list/detail változatok;
- könyvtárstruktúra és storage key-k változatlanul.

A képmappa mentését az adatbázis-mentéshez közeli időpontban kell készíteni. Visszaállítás után mintavételezve ellenőrizni kell, hogy az adatbázis storage key-jeihez léteznek és megnyithatók a fájlok.

## Konfiguráció mentése

Verziózható és menthető:

- `.env.example`, `backend/.env.example`, `frontend/.env.example`;
- Compose, Dockerfile, workflow és dokumentáció;
- környezeti változók neve és leírása.

Nem verziózható:

- `.env` tényleges értékei;
- adatbázis-jelszó, `SECRET_KEY`, Brevo/Turnstile kulcs;
- token, privát kulcs, tanúsítvány.

Productionben a secret manager külön mentési és visszaállítási eljárást igényel. A konfigurációmentésben csak a szükséges kulcsnevek és a környezethez tartozó leltár szerepeljen.

## Visszaállítás utáni ellenőrzések

```powershell
docker compose exec -T backend alembic current
docker compose exec -T backend pytest
docker compose exec -T redis redis-cli ping
docker compose ps
```

Emellett mintavételezve ellenőrizendő:

- felhasználói és admin jogosultságok;
- aktív, lezárt és piszkozat aukciók;
- licitek, nyertes és aktuális ár konzisztenciája;
- értesítések, mentett keresések, reportok és blokkolások ownershipje;
- aukcióképek és variánsaik;
- `/health/ready` válasz;
- érzékeny adat hiánya a logokból.

## Local és production különbségek

Local környezetben a Compose service-ek, bind mountok és `scripts/*.ps1` használhatók. Productionben szükséges:

- automatizált, ütemezett és titkosított off-site backup;
- dokumentált RPO/RTO és megőrzési idő;
- korlátozott backup/restore jogosultság;
- rendszeres, elkülönített restore gyakorlat;
- objektumtároló-verziózás vagy külön médiamentés;
- restore esemény auditálása és operátori jóváhagyása.

Production restore előtt az alkalmazást írásvédett vagy karbantartási állapotba kell tenni, a visszaállítást új adatbázisba validálni, majd kontrollált átkapcsolást végezni.
