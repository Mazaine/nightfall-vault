# Éles teszt előtti műszaki lezárás – 2026-11-11

**2026-11-12-i tényleges előellenőrzés:** [release-preflight-2026-11-12.md](release-preflight-2026-11-12.md).
A teljes kiadási kapu jelenleg nem zöld: production-konfiguráció/mentés nem elérhető,
a munkafa nem commitolt, és a helyi médiaaudit 22 616 korábbi hivatkozás nélküli fájlt jelez.
Az új pytest-médiaizolációval 395 backendteszt sikeres; meglévő fájl nem törlődött.

Hatókör: a helyi `D:\Projects\nightfall-vault` munkafa, nem a változatlan Git HEAD
és nem az ismeretlen éles infrastruktúra. Commit, push, deploy és valódi partner-rendelés nem történt.

## Megvalósított védelmek

### Ellenőrzési eredmények

- Végleges teljes backend: **394 sikeres**, 27 meglévő figyelmeztetés, 253,50 s.
- Teljes frontend frissített lockfile-lal: **332 sikeres**, 0 hibás; az utolsó
  tájékoztató-szövegezés után az érintett három fájlban további **17/17** teszt sikeres.
- TypeScript és production frontend build: sikeres.
- Production backend image: `nightfall-vault-backend:release-check` felépült;
  hálózat nélkül UID 10001, PyJWT 2.15.1, Pillow 13.0.0, PNG-dekódolás sikeres.
- Production infrastruktúra-contract, env-validator futási teszt és shell-szintaxis: sikeres,
  csak olvasható repón, hálózat nélküli konténerben.
- Izolált `pg_dump`/`pg_restore` és 0053→0055 upgrade: sikeres, próbaadatok eltávolítva.
- Backend production-függőségek: 55 csomag, 0 találat. Teljes npm audit: 0 találat.
- Alembic head: 0055; `alembic check` továbbra sem tiszta a lent felsorolt négy régi eltérés miatt.
- A meglévő helyi rendelés az ellenőrzéskor `queued`, `attempts=0`, személyesadat-törlés nélkül.
- Új migráció nincs; a meglévő, még nem kiadott 0054/0055 visszamigrálási védelme erősödött.
- Élő, bejelentkezett adminfelület: 90 napos előnézet, 0 törölhető rendelés; törlés/küldés nem történt.
- A backend, scheduler és notification-outbox külön lokális image-e is újraépült;
  a tényleges futási verzió mindháromban PyJWT 2.15.1.
- Fejlesztői frontend/backend/DB portok: csak 127.0.0.1. `git diff --check`: sikeres,
  a meglévő Windows sortörés-figyelmeztetésekkel.

### Fájlok ebben a lezárási körben

- `backend/app/core/{config,logging_config,redaction}.py`, `backend/app/db/session.py`;
- `backend/app/services/{security_audit,dicemagic_privacy}.py`, `backend/app/api/dicemagic.py`;
- `backend/alembic/versions/{0054_dicemagic,0055_dicemagic_checkout}.py`;
- `backend/tests/{test_prelaunch_security_audit,test_release_hardening}.py`;
- `backend/requirements{,-prod}.txt`, backend/frontend `.dockerignore`, frontend `package-lock.json`;
- `frontend/src/components/DiceMagicPrivacy{.tsx,.test.tsx}`, `DiceMagicCheckout.tsx`;
- `frontend/src/pages/admin/AdminDiceMagicPage.tsx`, `frontend/src/content/privacy.md`;
- `scripts/{restore_production,rollback_production}.sh`, `scripts/test_release_restore.ps1`;
- `backend/scripts/prove_release_restore.py`, `docker-compose.yml`, a helyi `.env` megőrzési kapcsolói és env-example fájlok;
- ez a lezárás, az adatmegőrzési szabály, a friss audit JSON és az eredeti auditban elhelyezett hivatkozás.

- F03: a JSON és szöveges formatter redakciót használ; az Uvicorn saját handlerei is.
  A konfigurált secretek, DB/Redis URL-ek, bearer/JWT értékek, e-mailek, érzékeny
  kulcsértékek és access-log query értékek maszkoltak. SQLAlchemy: `hide_parameters=True`.
  Az admin audit csak query-paraméterszámot tárol; a domain-audit metadata szűrt.
  Nyers rendelési payloadot/törölt adatot továbbra sem szabad naplózni.
  A DB-jelszó cseréjét a tulajdonos megerősítette; a régi credential külön próbája nem történt.
- F04: [90 napos, konkrét rendelési payload-szabály](dicemagic-data-retention.md),
  admin-only előnézet, explicit batch-megerősítés, HMAC-verzióvédelem, sorzár,
  audit és tranzakciós végrehajtás. Nyitott, bizonytalan, egyeztetetlen vagy teljesítetlen
  rendelés kizárt. Idempotencia, készlet és ügyletkapcsolat nem törlődik.
- F05: PyJWT 2.15.1 mindkét requirements fájlban; 21 kompatibilis npm-frissítés.
  [Friss backend audit](security-release-2026-11-11-dependencies.json): 55 csomag,
  0 ismert sérülékenység. A teljes npm auditban is 0 találat.
  Az OIDC hitelesítés fix szolgáltatói JWKS URL-t és RS256-ot használ; a helyi
  tokenek HS256-osak. Az options-dict újrafelhasználásos claim-ellenőrzési regresszió külön tesztelt.
- F07: a 0054/0055 downgrade adatot tartalmazó rendelési/hold/checkout táblán
  még a DDL előtt megáll. A restore minden írót (outboxot is) leállít, az image-rollback
  az outboxot is a megfelelő verzióra állítja. Automatikus DB-downgrade nincs.
- F08: `.env*` Docker-context kizárás, kifejezett `.env.example` kivétellel.
- F06: a fejlesztői frontend/backend/PostgreSQL portbindja csak `127.0.0.1`;
  nem publikáljuk a helyi, valódi küldésre engedélyezett adminpróbát minden hálózati interfészen.

## Bizonyított helyi visszaállítás

`scripts/test_release_restore.ps1` kizárólag a külön `postgres-test` szolgáltatáson,
véletlen nevű, eldobható adatbázisokat hoz létre. A meglévő useradatot tartalmazó
0053 sémát 0055-re emeli, szintetikus 9 példányos rendelést ad hozzá, majd valódi
`pg_dump`/`pg_restore` próbával ellenőrzi a headet, a usert, a rendelésazonosítót,
payloadot, mennyiséget és összeget. A tesztadatbázisok és dump a végén eltűnnek.
Ez nem az éles adatbázis vagy a teljes korábbi migrációs történelem ellenőrzése.

## A négy ismert sémaeltérés kezelési terve

Az `alembic check` továbbra is nem nulla kilépésű; ezt nem minősítjük tiszta sémának.
Nincs új DiceMagic-eltérés, head: `0055_dicemagic_checkout`.

| Objektum | Jelenlegi állapot | E kiadás kezelése |
|---|---|---|
| `auctions.highest_bid_id` FK | DB: NO ACTION; modell: SET NULL | A szigorúbb meglévő védelem marad. Fizikai licittörlés előtt külön migrációs/adatkapcsolati vizsgálat kell. |
| `demo_auction_batches_batch_key_key` | Extra unique | Megmarad; egyediség nem lazul automatikusan. |
| `uq_demo_auction_batches_single_live` | Extra unique index | Megmarad; élő demó-batch védelem nem lazul. |
| `ix_reports_created_at` | Extra index | Megmarad; nincs indokolatlan index-/adatbázis-refaktor. |

Stagingen a tényleges séma diffjét össze kell vetni ezzel a pontos négyes listával.
Új/eltérő objektum kiadási STOP. A későbbi tisztázás külön, mentéssel és másolt adatokon
tesztelt migrációt igényel; az autogenerate eltávolításait tilos vakon alkalmazni.

## Kontrollált production-próba kiadási menete

1. A változtatásokat a normál review/kiadási folyamatba kell venni. A deploy-script
   tiszta, azonosítható Git-kiadást igényel; e körben a commit tiltott volt.
2. A tényleges `PRODUCTION_ENV_FILE` és production Compose ellenőrzése kötelező.
   A gyökér lokális `.env` nem production-konfiguráció; azt nem szabad vakon átmásolni.
   DiceMagic láthatóság admin-only; küldéskapcsoló kezdetben kikapcsolva.
   A 90 napos policy beállítása és a teljes adatkezelési tájékoztatás ellenőrzése külön üzemeltetési lépés.
3. Titkosított/hozzáférés-védett friss DB- és médiamentés, checksum és visszaállítási
   próba kell az adott telepítéshez. A repo backup/restore scriptjei rendelkezésre állnak;
   az aktuális éles mentést ebben a körben nem értük el és nem igazoltuk.
4. A staging-upgrade, séma-összevetés és `scripts/release_gate.sh local-preflight`
   után a meglévő deploy-folyamat használható. Nyers dev Compose nem éles kiszolgáló.
5. Postdeploy health, API, admin/guest jogosultság, képfeltöltés, kosár és
   `production-postdeploy` gate. Csak ezután külön adminengedély a partnerrel egyeztetett
   egyetlen próbarendeléshez. Fizetés/teljesítés nem igazolódik automatikusan.
6. Bizonytalan válasznál ugyanaz a külső ID marad; tilos új rendelést gyártani.
   Image-rollback DB-downgrade nélkül történik. Restore előtt a partnerrel egyeztetni
   kell a mentés óta elfogadott rendeléseket: egy régi DB-kép nem vonja vissza a külső rendelést.

**Döntés:** a műszaki javítások helyben teszteltek; a kontrollált, admin-only production-próba
a fenti környezetspecifikus kapuk után indítható. Ez nem nyilvános bolti indulás,
nem automatikus deploy-engedély és nem teljes körű adatvédelmi tanúsítás.

Elsődleges függőségi forrás:
[PyJWT hivatalos changelog](https://pyjwt.readthedocs.io/en/stable/changelog.html).
