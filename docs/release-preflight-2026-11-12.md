# További kiadás előtti ellenőrzések – 2026-11-12

## Eredmény

**A teljes kiadási kapu nem zöld.** Az elérhető helyi és publikus, olvasási ellenőrzések
elkészültek; valódi production-konfigurációt és production-mentést nem tudtunk igazolni.
Deploy, commit, push, valódi rendelésküldés és meglévő médiafájl törlése nem történt.

## Publikus éles HTTPS-ellenőrzés

Cél: `https://nightfallvault.hu`, hitelesítés nélkül, módosító kérés nélkül.

| Végpont / ellenőrzés | Eredmény |
|---|---|
| `/`, `/health/live`, `/health/ready` | 200 |
| CSP, X-Content-Type-Options, X-Frame-Options, HSTS | Mind jelen van; ez a jelenlétet, nem minden fejléc teljes helyességét bizonyítja. |
| `/robots.txt`, `/sitemap.xml` | 200; `/account` és `/admin` robots-tiltás jelen van. |
| `/docs`, `/redoc`, `/openapi.json`, `/health/metrics` | 404 |
| `/api/cart` | 401 |
| `/api/admin/integrations/dicemagic` | 404; ebből az új integráció éles verziója és adminjogosultsági működése nem igazolható. |

## Tényleges konfiguráció és kiadási kapu

- A felhasználó által megadott, itt elérhető gyökér `.env`: `environment=development`,
  frontend/backend host `localhost`, CAPTCHA kikapcsolva. Ez nem production-konfiguráció.
- `.env.production` nincs; `PRODUCTION_ENV_FILE` felülírás nincs.
- Beállított helyi SSH-hostkonfiguráció nem található. VPS-hez nem csatlakoztunk.
- A tényleges `scripts/release_gate.sh local-preflight` futás exit 1:
  „Hiányzó production env fájl”. A kaput nem helyettesítettük a példafájllal.
- A munkafa módosított és új fájlokat tartalmaz. A gate külön tiszta, azonosítható
  Git-kiadást is követel; a korábbi commit-tilalmat megtartottuk.
- A production szerver konfigurációja és friss mentése csak a szerveren használt
  `.env`/mentés elérésével ellenőrizhető. A lokális `.env` átnevezése nem oldja ezt meg.

## Titokellenőrzés

553 követett és új, nem ignorált kiadási fájlt ellenőriztünk ismert mintákra,
példafájlok és maga a szkenner kivételével. Nyers találati értéket nem írtunk ki.
Egy találati hely volt: `backend/tests/test_sprint17_production.py:21`, a
`production_settings` tesztfixture tesztjelölést tartalmazó Turnstile-beállítása.
Ez vizsgált fixture-találat, nem bizonyíték kiszivárgott éles secretértékre.
A tényleges `.env`/`.env.production` fájlok nincsenek verziókövetésben.
Az ellenőrzés mintakeresés; nem minden lehetséges secretformátumra adott tanúsítás.

## Médiaaudit és újonnan javított tesztizoláció

- Helyi adatbázisban hivatkozott média-kulcsok: 176.
- Hiányzó fájl: **0**.
- Hivatkozás nélküli fájl: **22 616**, az `auctions/2026/...` alatt,
  original/list/detail/thumbnail csomagok formájában. Korábbi teszt-/demómaradványokkal
  összeegyeztethető; teljes eredetigazolás vagy törlés nem történt.
- A korábbi pytest-őr csak az adatbázist különítette el, a médiát nem.
  A `backend/tests/conftest.py` most saját `TemporaryDirectory`-t állít be még
  az alkalmazás/storage importja előtt. Csak az új tesztkönyvtár takarítódik ki,
  a meglévő médiakötet nem. Új regresszió: `test_pytest_media_isolation.py`.
- Teljes backend ezzel: **395 sikeres**, 27 meglévő figyelmeztetés, 234,79 s.
- A teljes futás után ugyanúgy 22 616 árva és 0 hiányzó fájl maradt: a tesztek
  nem szaporították tovább a közös médiakötet maradványait.
- A szigorú helyi release gate az árva média hiányát is követeli, ezért a meglévő
  22 616 fájl külön, mentés utáni eredetvizsgálata/rendezése szükséges. Nem kerültek
  törlésre vagy pusztán a kapu megkerülése érdekében áthelyezésre.

## Friss helyi mentés és valódi visszaállítási próba

Könyvtár (Gitből kizárt):
`backups/local-preflight-20261112-064352-0e84ac/`.

- `database.dump`: 576 463 bájt; SHA-256:
  `9331A5B778C6BED1D11055ED83B8A1BCFDC1E460084592240F7AA392FC83905F`.
- `media.tar.gz`: 12 609 589 bájt; SHA-256:
  `4D0DDD536B3E8357F24C7CA286C0246057E94C820F7D284E4A4DC317EBCD5F73`.
- A médiaarchívum teljes fájllistája olvasható, a tömörített állomány ellenőrzése sikeres.
- A DB-mentés visszaállítása új, eldobható `postgres-test` adatbázisba sikeres.
  Egyezett a 34 user, 1021 hirdetés, 1 bolti rendelés, a rendelés teljes rekordjának
  ellenőrzőösszege és az `0055_dicemagic_checkout` head.
- A próbaadatbázis és a konténerbeli ideiglenes dump eltávolítva. Régi mentés nem törlődött.
- Ez **helyi fejlesztői mentés**, nem production-mentés. A júliusi régi helyi mentés megmaradt.

## Végső helyi állapot

Backend/frontend/PostgreSQL/scheduler/Redis egészséges; outbox fut.
A publikált helyi portok csak 127.0.0.1-en érhetők el. `git diff --check` sikeres,
csak a meglévő Windows sortörés-figyelmeztetések látszanak.
A bolti rendelés továbbra is `queued`, `attempts=0`, személyesadat-törlés nélkül.
A korábbi 332 frontendteszt, build és 0 találatos függőségi audit eredményét ez a
tesztizolációs módosítás nem érinti; ezeket szükségtelenül nem futtattuk újra.
