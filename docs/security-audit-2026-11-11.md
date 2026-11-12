# Nightfall Vault – élesítés előtti biztonsági audit

Dátum: 2026. november 11. Projekt: `D:\Projects\nightfall-vault`.
Vizsgált branch: `main`; HEAD: `0f93c450ef29f4b0737da52bc524d143da89ea43`.
Az audit tárgya a HEAD **és a már meglévő, nem commitolt DiceMagic-fejlesztés** együtt.

## Aktuális döntés – az engedélyezett célzott javítás után

**Újabb műszaki lezárás:** a felhasználó „készre kérem” kérése alapján az F03/F05/F07
javításai, az F04 védett adatminimalizálása és a 90 napos működési szabály elkészültek.
A friss, hatókörhöz kötött döntés és a tényleges élesítés előtti kapuk:
[security-release-readiness-2026-11-11.md](security-release-readiness-2026-11-11.md).
Az alábbi rész az eredeti audit és a korábbi célzott kör történeti állapotát is megőrzi;
a régi nyitott/javítatlan minősítéseket a friss lezárási dokumentummal együtt kell olvasni.

**Felhasználói visszajelzés (2026-11-11):** az érintett DB-jelszó cseréje megtörtént.
A jelszórotációs manuális teendő a felhasználó megerősítése alapján lezárva;
a régi hitelesítőadat érvénytelenítését külön nem teszteltük. Az alábbi történeti
megállapítások idején a csere még nem történt meg. Az F03 általános naplómaszkolási
és hozzáférés-felülvizsgálati része ettől továbbra is nyitott.

**BIZTONSÁGI ÁLLAPOT: Feltételesen alkalmas, az alábbi nyitott feltételekkel.**

A két eredeti blokkoló megállapítás célzott javítása elkészült:

1. **F01 lezárva:** generációvédelem és új sorzár mellett a késői hiba nem írja felül az elfogadást. A kézzel egyeztetett lezárás nem nyílik vissza.
2. **F02 lezárva:** Pillow 13.0.0, tartalom szerinti parser-engedélylista, dekódolás előtti méretellenőrzés. A tiltott formátumot a kód még a Pillow meghívása előtt elutasítja.

A részletes javítások és az utóellenőrzés a dokumentum végén találhatók. Ez **nem általános élesítési vagy valódi rendelésküldési jóváhagyás**: F03 naplózás/incidenskezelés, F04 adatkezelési döntések, F05 további függőségi triázs és F07 visszaállítási/driftkezelési terv nyitott. Az első valódi próbarendelés is külön, tudatos adminengedélyezést igényel; a környezeti küldési kapcsoló kikapcsolva maradt.

Ez a minősítés a vizsgált kód kiadására vonatkozik; nem állítja, hogy az éles rendszert kihasználták. Kritikus, alkalmazásszinten igazolt hibát nem találtam. A függőségek egyes nyilvános riasztásai kritikus besorolásúak, de ezeket nem számoltam automatikusan bizonyított Nightfall-sérülékenységnek.

Az eredeti audit alkalmazáskódot nem javított; az F01/F02 javítása az ezt követő kifejezett felhasználói engedéllyel történt. Jelszó, `.env` és adatmodell nem változott. Nem történt commit, push, deploy, production-adatmódosítás vagy valódi DiceMagic-rendelésküldés. A gyökér `.env` tartalma az audit és az utóellenőrzés során is azonos SHA-256 ujjlenyomatú.

## Módszer és határok

- Git-státusz, konfiguráció, backend API, modellek, checkout, készletfeloldás, chat és frontend adatfolyam kézi kódvizsgálata.
- Izolált PostgreSQL-tesztek: a pytest indulási őre megköveteli a fejlesztőitől eltérő, `_test` végű adatbázist. A partnerkapcsolók alapértelmezetten kikapcsoltak; az audit-fixture minden partner-HTTP-műveletet helyettesít, és tiltja a valódi HTTP-transport használatát.
- A hibák reprodukciója szintetikus naplóbejegyzéssel, hamis partner-válaszokkal és ártalmatlan képfájllal történt. Nem futott DoS-payload, memóriakorrupciós exploit vagy adatot tartalmazó adatbázis-visszamigrálás.
- `npm audit`, eldobható konténerben `pip-audit`, és fontosabb riasztások ellenőrzése a GitHub Advisory Database-ben.
- Az éles infrastruktúrához, partneri rendelés-adatbázishoz, régi Docker-image-ekhez, teljes naplóarchívumhoz és mentésekhez nem történt hozzáférés. A jelentés nem teljes infrastruktúra-pentest vagy jogi megfelelőségi tanúsítás.

## Megállapítások

### F01 – MAGAS – JAVÍTVA: késői küldési eredmény állapotfelülírása

- **Hely:** `backend/app/services/dicemagic.py:217`, `send_order`; kapcsolódó `dicemagic_transactions.py:link_accepted_order`.
- **Ok:** a függvény a `sending` állapot mentésekor commitol, elengedi a sorzárat, majd a HTTP-válasz után új zárolás és küldési generációhoz kötött feltételes mentés nélkül ír. Két percnél régebbi `sending` újrapróbálható. A tranzakciólinkelő megjegyzésével ellentétben a külső kérés utáni szakaszban a hívó nem tartja folyamatosan az eredeti zárat.
- **Feltétel:** elakadó vagy szünetelő első worker, két percnél későbbi admin-újrapróbálás, majd a régi worker késői timeoutja. A teszt a tartós időbélyeget öregíti meg, így nem vár perceket és nem küld valódi kérést. Ez szélső időzítési eset, nem minden szokásos 20 másodperces timeout következménye.
- **Eredeti bizonyíték:** `test_audit_late_timeout_overwrites_accepted_retry`. Javítás előtt a második kérés `accepted` állapotot és ügyletet hozott létre, majd a régi hívás után a rendelés `unknown` lett. A teszt most `test_late_response_preserves_accepted_retry` néven a biztonságos viselkedést követeli meg, négyféle késői válasszal.
- **Hatás:** a külső elfogadás és a helyi állapot eltér; hibás újrapróbálás, operátori döntés és készletegyeztetés következhet. A teszt **nem bizonyított két külső rendelést**. A stabil külső ID fontos védelem, de nem oldja meg a helyi állapot versenyhelyzetét.
- **Javaslat:** rövid, új sorzár a válasz feldolgozásakor; küldési generáció/azonosító és feltételes frissítés; az elfogadott vagy lezárt állapot ne legyen felülírható elavult hibával; tranzakciólinkelés és állapotmentés azonos zárolt tranzakcióban. Regresszió: timeout/siker, siker/siker és egyeztetés/késői válasz sorrendek.
- **Élesítési blokk:** az eredeti hibára **megszűnt**, az alább dokumentált konkurens regressziókkal igazolva.

### F02 – MAGAS – JAVÍTVA: sérülékeny képparser elérése

- **Hely:** `backend/requirements.txt`, `backend/requirements-prod.txt` (`Pillow==12.3.0`); `backend/app/images/validation.py:30`, `validate_image_upload`; további `Image.open` hívások az `images/processing.py` és `services/auction_share_image.py` fájlokban.
- **Ok:** a MIME-fejléc engedélyezett értéke után a kód `Image.open(...)`-t hív `formats=` korlátozás nélkül. A tényleges formátumot csak a parser futása és `verify()` után ellenőrzi.
- **Feltétel:** olyan felhasználó, aki hozzáfér a képfeltöltéshez, engedélyezettnek deklarált MIME-mal más formátum bájtjait küldi. A fájlméret- és pixelkorlát nem védi a még formátumfelismerés előtt futó parsert.
- **Eredeti bizonyíték:** `test_audit_disallowed_image_codec_is_opened_before_rejection` ártalmatlan XBM-képpel igazolta a parser elérését. A teszt most `test_disallowed_image_is_rejected_before_any_pillow_parser` néven azt követeli meg, hogy a Pillow egyáltalán ne legyen meghívható. A [CVE-2026-112901 / GHSA-xgh8-jp6q-p5x8](https://github.com/advisories/GHSA-xgh8-jp6q-p5x8) javított verziója 13.0.0; ez a jelenlegi dev és production ellenőrző image-ben is igazoltan telepítve van.
- **Hatás:** képfeltöltésen keresztüli szolgáltatásmegtagadási kockázat. A vendor ezt a konkrét riasztást közepesnek jelöli; az alkalmazás több workerét érintő, elérhető feltöltési út miatt itt magas kiadási kockázatként kezelem. RCE-t vagy worker-leállást nem reprodukáltam.
- **Javaslat:** tesztelt Pillow-frissítés legalább a szükséges javításokat tartalmazó kiadásra; explicit JPEG/PNG/WEBP parserlista; az összes képfeldolgozó belépési pont átvizsgálása. A parserlista önmagában nem helyettesíti a frissítést. Például a [JPEG-dekóder riasztása](https://github.com/advisories/GHSA-8g5g-8vmr-9782) más feltételekhez kötött; a mostani feldolgozó teljes dekódolás után készít thumbnailt, ezért ezt nem minősítettem automatikusan ugyanazon exploitnak.
- **Élesítési blokk:** a megnevezett parserhibára **megszűnt**. A Pillow-frissítést és a JPEG/PNG/WebP kompatibilitását tesztek és hálózat nélküli production-image smoke-teszt igazolja.

### F03 – KÖZEPES – A naplózásnak nincs általános titok- és PII-maszkolása

- **Hely:** `backend/app/core/logging_config.py:8`, `JsonFormatter.format`; `backend/app/db/session.py`; `backend/app/services/security_audit.py:52`; `backend/alembic/env.py:12`.
- **Ok:** a `SENSITIVE_KEYS` halmaz nincs használatban, a formatter változtatás nélkül adja vissza a `record.getMessage()` értékét. A szöveges dev formatter tracebacket is kiír. Az SQLAlchemy motor nem használ `hide_parameters=True` beállítást. Az admin audit a nyers query stringet tárolja.
- **Ismert incidens:** az Alembic `ConfigParser` százalék-interpolációja hibásnak tekintette az URL százalékjeleit, és a kivétel tartalmazhatta az átadott kapcsolati karakterláncot. A jelenlegi munkafában már szerepel a korábbi `.replace("%", "%%")` javítás; ezt az audit nem változtatta. Ez az adott kiváltó okot kezeli, nem általános naplómaszkolás.
- **Feltétel:** érzékeny érték kerül naplóüzenetbe vagy SQL-hiba paraméterei közé, és illetéktelen személy naplóhoz/transcripthez fér hozzá. A partnerkliens jelenleg kódolt hibákat dob és nem naplózza a response bodyt vagy Authorization fejlécet.
- **Bizonyíték:** `test_audit_characterizes_unredacted_synthetic_log_message` mesterséges jelszóval. A production JSON formatter jelenleg kihagyja az `exc_info` tartalmát, így nem állítom, hogy minden SQL-hiba paramétere productionben automatikusan kiíródik. Az üzenetbe tett érték azonban ott sem maszkolódik.
- **Hatás:** lehetséges hitelesítőadat- és vásárlóiadat-szivárgás operációs csatornákon. A vizsgált konténernapló-mintában nem találtam a jelenlegi secretértékeket.
- **Javaslat:** központi strukturált redakció üzenetre és kivételre, SQL-paraméterek elrejtése, query string engedélylista, szintetikus secret-regresszió. A korábban megjelent helyi DB-jelszó kézi rotációja és az érintett transcript hozzáférésének felülvizsgálata indokolt; automatikus rotáció nem történt. DiceMagic-secret kiszivárgására nem találtam bizonyítékot.
- **Élesítési blokk:** a kézi incidenskezelés és a naplózási kockázat lezárása kiadás előtti feltétel; nem bizonyított publikus API-adatszivárgás.

### F04 – KÖZEPES – A rendelési személyes adatok életciklusa nincs véglegesítve

- **Hely:** `backend/app/models/dicemagic.py:DiceMagicOrder.payload`; `backend/app/api/auth.py:630`, `delete_me`; `docs/dicemagic-v1.md:106`.
- **Ok:** a tartós rendelési JSON tartalmazza a nevet, e-mailt, opcionális telefont, cím- és számlázási adatokat. Nincs az integrációhoz megvalósított megőrzési/anonymizálási folyamat; a dokumentáció ezt nyitott feladatnak jelzi. A fióktörlés nem kezeli ezt a payloadot; a régi felhasználói e-mailt is csak prefixeli, nem anonimizálja.
- **Feltétel/hatás:** hosszabb tárolás vagy törlési kérelem esetén a szükségtelenné vált adatok megmaradhatnak. Ez nem másik felhasználó számára bizonyított hozzáférési rés, és az ügyleti adatok jogszerű megőrzése önmagában nem hiba.
- **Bizonyíték:** a payload modellje, a fióktörlő függvény és a dokumentált hiány. Törlési tesztet valódi fiókon nem futtattam.
- **Javaslat:** emberi adatvédelmi/jogi döntés a szerepekről, jogalapról, időtartamokról és megőrzési kivételekről; utána célzott export/törlési/anonymizálási folyamat, amely megőrzi a kötelező pénzügyi és ügyleti bizonyítékot. A mezők szintű DB-titkosítás hiányából önmagában nem következtettem titkosítatlan lemezre: az infrastruktúrát nem vizsgáltam.
- **Élesítési blokk:** valódi vásárlói adatok széles körű gyűjtése előtt tisztázandó; jogi megfelelőséghez emberi felülvizsgálat kell.

### F05 – KÖZEPES – További ismert függőségi riasztások maradtak

- **Hely:** backend requirements fájlok; `frontend/package-lock.json`.
- **Eredeti bizonyíték:** 49 feloldott backend production csomagon a `pip-audit` **54 riasztást** jelzett: PyJWT 2.13.0: 15; Pillow 12.3.0: 39. Az eredeti azonosítók a [korábbi mellékletben](security-audit-2026-11-11-dependencies.json) maradtak meg. **Javítás után: 15 riasztás, kizárólag PyJWT 2.13.0**, Pillow 13.0.0-ra nincs találat. A [friss gépi eredmény](security-fixes-2026-11-11-dependencies.json) külön fájl. Ezek scanner-riasztások, nem ugyanennyi igazolt alkalmazáshiba.
- **Elérhetőség:** az F02 konkrét Pillow-útvonalát külön értékeltem. A [PyJWT kevert algoritmusos riasztásának](https://github.com/advisories/GHSA-ffc3-869f-jxw9) feltétele nem áll fenn a vizsgált production JWT-belépésnél: egyetlen HS256 van engedélyezve, a production guard is ezt követeli. Nem használnak ugyanitt kliens által választott JWK-t vagy vegyes aszimmetrikus/HMAC listát. A 15 riasztás összes lehetséges könyvtári hívási útját nem reprodukáltam; az algoritmusellenőrzés nem általános felmentés mindegyikre.
- **Frontend:** `npm audit --omit=dev`: **0**. Teljes npm audit: **8 érintett csomag**, ebből 5 high és 3 moderate; ezek fejlesztői/build függőségek. Csomagok: Vite, Vitest, @vitest/mocker, browserslist, baseline-browser-mapping, nanoid, source-map-js, undici. Ez nem nyolc production böngészős sérülékenység. Példa: a [Vite/Windows editor-megnyitási riasztás](https://github.com/advisories/GHSA-698v-4r3x-3vcv) fejlesztői környezethez kötött.
- **Hatás/feltétel:** a konkrét advisory függvényének és előfeltételeinek elérhetősége szerint változik. A nyilvános adatok alapján RCE-t vagy JWT-hamisítást nem állítok a Nightfallban.
- **Javaslat:** külön, verziózott és tesztelt függőségfrissítés, PyJWT-részletes triázs, buildlánc újraauditálása; ne fusson vak `audit fix --force`. A jelentéskor a legtöbb PyJWT-riasztás 2.14.0/2.15.0 javítást jelöl, egyhez a scanner nem adott javítóverziót; ezért puszta verzióemelés nem jelent automatikusan nulla találatot.
- **Élesítési blokk:** az F02 javítva; a további találatok elérhetőségi triázsa/frissítése kiadás előtti feltétel, nem egyenértékű bizonyított production exploitokkal. PyJWT-frissítés nem tartozott a két engedélyezett célzott javításhoz.

### F06 – KÖZEPES – A fejlesztői portok minden interfészen publikáltak

- **Hely:** `docker-compose.yml:10`, `:37`, `:138`; `frontend/Dockerfile:12`.
- **Ok/bizonyíték:** a futó fejlesztői frontend és backend Docker-portja `0.0.0.0` és IPv6 wildcard címen van, a Compose a fejlesztői PostgreSQL-portot is publikálja. A Vite hostja `0.0.0.0`.
- **Feltétel:** a host tűzfala vagy hálózata enged bejövő kapcsolatot. Külső gépről elérhetőséget nem teszteltem, tehát internetes kitettséget nem állítok.
- **Hatás:** a fejlesztői felület, dokumentáció és ismert fejlesztőieszköz-riasztások nagyobb támadási felülete.
- **Javaslat:** helyi fejlesztéshez loopback portbind vagy tudatos, elkülönített hálózat; Vite ne legyen éles kiszolgáló. A production Compose külön architektúrája a backendet/DB-t nem publikálja közvetlenül.
- **Élesítési blokk:** a dev Compose production használatát blokkolja; a production Compose önmagában nem emiatt hibás.

### F07 – KÖZEPES – A sémaeltérések és a visszaállítás adatvesztési kockázata nyitott

- **Hely:** `backend/alembic/versions/0054_dicemagic.py:21`, `0055_dicemagic_checkout.py:48`, `backend/alembic/env.py:bootstrap_fresh_database`.
- **Bizonyíték:** 55 revízió, egy head (`0055_dicemagic_checkout`), hiányzó szülő nincs. A helyi DB is ezen a headen van. Az `alembic check` négy korábban ismert objektumeltérés miatt nem tiszta: `auctions.highest_bid_id` ON DELETE; extra `demo_auction_batches_batch_key_key`; extra `uq_demo_auction_batches_single_live`; extra `ix_reports_created_at`. Új DiceMagic-eltérést nem jelzett.
- **Hatás:** az ON DELETE-különbség törlési/karbantartási viselkedést módosíthat; a régi unique objektumok a modell által nem jelzett ütközést okozhatnak. Az extra reports index inkább teljesítmény/karbantartás, nem bizonyított jogosultsági rés. Ezeket nem töröltem automatikusan.
- **Rollback:** 0055 megtagadja a 9 feletti darabszámok veszteséges visszamigrálását, de 1–9 darab mellett is eldobja az új holdokat, checkout intenteket, tranzakciólinket és készletplafont. 0054 eldobja a rendelési táblákat. Ez csak kifejezett downgrade esetén történik; a normál upgrade nem törli a régi tranzakciókat. A meglévő `rollback_production.sh` tudatosan csak image-et állít vissza, DB-downgrade-et nem futtat.
- **Feltétel:** érdemi adatokkal, mentési terv nélkül futtatott kézi downgrade vagy nem egyeztetett sémakarbantartás. Az üres DB metadata-bootstrapja és head-stampje nem bizonyítja a teljes történeti migrációs út adatmegőrzését.
- **Javaslat:** ismert drift célzott rendezési terve, ellenőrzött staging-adatmásolaton upgrade/backup/restore próba, nem üres integrációs táblákra downgrade-védelem. Éles rollbackhez ne tekintsük elegendőnek az üres DB-n végzett ellenőrzést.
- **Élesítési blokk:** a dokumentált visszaállítási és driftkezelési terv hiánya kiadási feltétel; nem bizonyított publikus támadás. Az audit nem futtatott downgrade-et.

### F08 – ALACSONY – A Docker build-context kizárás csak a pontos `.env` névre terjed ki

- **Hely:** `backend/.dockerignore`, `frontend/.dockerignore`; `backend/Dockerfile.prod:16`, `frontend/Dockerfile.prod:5`.
- **Ok:** `.env.production`, `.env.local` és egyéb `.env.*` nevekre nincs általános kizárás, miközben `COPY . .` fut.
- **Feltétel/hatás:** ha később titkos konfiguráció kerül a backend/frontend könyvtárába, bekerülhet build-contextbe, builder cache-be, backend esetén runtime image-be is. Jelenleg ott csak `.env.example` található; a valódi gyökér `.env` kívül esik ezeken a build-contextokon. Aktuális ilyen szivárgást nem találtam.
- **Javaslat:** `.env*` kizárása, kifejezett example-kivétellel; image/build-cache vizsgálat a következő buildnél.
- **Bizonyíték:** a kizárási és COPY-szabályok, valamint csak fájlneveket kiíró könyvtárvizsgálat.
- **Élesítési blokk:** jelen állapotban nem, megelőző javítás.

### F09 – ALACSONY – Az integráció drága adminműveletein nincs külön kéréskorlát

- **Hely:** `backend/app/api/dicemagic.py`: `connection`, `sync`, `prepare`, `send`; `backend/app/core/rate_limit.py:157`; `nginx/default.conf`.
- **Ok:** központi adminjogosultság van, külön integrációs rate limit nincs. A rendelési retry-backoff csak bizonyos rendelési állapotokra vonatkozik, nem globális partnerkvóta. A vizsgált nginxben nincs általános `limit_req`. A meglévő auth-limit IP+azonosító szerint számol, nem önálló globális IP-korlátként.
- **Feltétel/hatás:** hibás adminautomatizálás vagy kompromittált admin terhelheti a partnert/szervert; megváltoztatott azonosítóval a különálló auth-bucketek is növelik az összterhelést. Normál user az adminjogosultságot ettől nem kerüli meg. Productionben a kötelező CAPTCHA és Redis csökkenti az auth-kockázatot.
- **Javaslat:** felhasználó-, integráció- és IP-szintű rétegezett limit, globális partnerkvóta, sync-mutex és terhelési megfigyelés. A meglévő Redis-hiba productionben fail-closed 503-at ad: ezt meg kell őrizni.
- **Bizonyíték:** router- és limiter-kódvizsgálat. Terheléses teszt nem futott.
- **Élesítési blokk:** önmagában nem, admin-only pilotban korlátozott maradványkockázat.

## A nyolc kért terület értékelése

| Terület | Ellenőrzött védelem és eredmény | Nyitott rész |
|---|---|---|
| DiceMagic hitelesítés | Fix HTTPS origin és három engedélyezett path; nincs redirectkövetés; Basic hitelesítés csak tokenkérésnél; lejárat előtti tokenfrissítés; folyamaton belüli lock; 401 után legfeljebb egy újrakérés. Nem ad vissza secretet az admin UI-nak. | Több workernek saját token-cache-e van; partnerkvóta és külső tokenvisszavonás nem volt tesztelve. |
| Admin-only védelem | Központi backend `require_admin`; vendég/normál/VIP negatív teszt, admin pozitív teszt; direkt ID, lista, kapcsolódó ajánlat és kosár védelem. Rendeléslista a saját buyer ID-re szűr. Másik admin rendeléséhez/chatjéhez nincs hozzáférés; lefokozott admin sem olvashatja a bolti chatet. | A teljes endpoint-halmaz minden paraméterkombinációját nem fuzzoltam. |
| Külső rendelésküldés | Környezeti kapcsoló + DB-kapcsoló + kérésszintű tudatos megerősítés. A checkout csak tartós intentet készít; nincs automatikus küldés. Stabil külső ID, ugyanaz a payload retrykor; 200 duplicate / 201 elfogadás ellenőrzött. F01 sorzár/generációvédelemmel javítva. | A partner külső idempotenciáját mockok és a dokumentált szerződés alapján ellenőriztem, valódi rendeléssel nem. |
| Készletbiztonság | Terméksorzárak, mennyiség 1–999 csak bolti taggel; normál mennyiség továbbra is 1–9. Tartós blokk, friss és pontos snapshot-token, zéró készlet és plafon, régi snapshot és követett→ismeretlen váltás elleni védelem. Vegyes kosár eredménye eladónként elkülönül. | A partnerállapot hivatkozása kézi adminigazolás, nincs független rendelésállapot-lekérdezés. Rosszhiszemű admin igazolását nem lehet gépileg bizonyítani. A plafon későbbi valódi feltöltésnél alulértékesítést okozhat. |
| Vásárlói adatok | Típusos, mezőkorlátozott payload; csak megadott vevő/szállítás/számlázás és megjegyzés; frontend beleegyezés és külön valódi rendelés figyelmeztetés. Az adminlista nem adja vissza a teljes cím- és számlázási payloadot. | F03/F04. A felhasználói megjegyzés szabad szöveg, ezért abban is lehet PII. Jogi/adatfeldolgozói felülvizsgálat szükséges. |
| Meglévő ügyletkezelés | A partner rendelése a meglévő AuctionTransaction és partnerenkénti beszélgetés része. Nincs automatikus teljesítés/fizetés/VP. F01 javítása után konkurens válaszoknál is egy ügylet és értesítés készül. A normál saját-hirdetés-vásárlási tiltás megmarad. | A bolt saját felületére nem szinkronizálódnak automatikusan a Nightfall-chatüzenetek. |
| DB és migrációk | 0053→0054→0055 ép lánc; egyedi külső rendelés-ID, buyer+idempotenciakulcs, product+order hold és tranzakciólink korlátok. Korábbi tranzakciók nem lettek átírva. | F07, a teljes történeti lánc staging-adatokon történő végigjátszása nincs igazolva. |
| Titkok és naplózás | A titkok backendoldali konfigurációban; nincs érték az adminstátusz válaszában. A gyökér `.env` nincs Gitben vagy a frontend build-contextben. Az aktuális titkok egyezésvizsgálata negatív. | F03/F08; teljes Git-blobtörténet, régi image-ek, mentések és minden archivált napló secret-auditja nem történt. |

### Kapcsolódó Nightfall-védelem

- JWT: aláírás és lejárat, adatbázisbeli `auth_version`, aktuális backend-role. Jelszóváltoztatás növeli a verziót. A refresh token a DB-ben hashként, HttpOnly cookie-ban tárolódik, rotálódik, újrafelhasználáskor a család visszavonódik.
- CSRF/CORS: az üzleti módosítások Authorization Bearert igényelnek; a refresh cookie SameSite=Lax és productionben Secure. A CORS engedélylista, nem wildcard, production guard tiltja a lokális originöket. Külön Origin/CSRF-token ellenőrzés a refresh/logout útvonalon nincs; kompromittált, azonos site alatti aldomain esetére külön hardening mérlegelendő. Ebből cross-site vásárlási exploitot nem igazoltam.
- XSS: a vizsgált React-forrásban nincs `dangerouslySetInnerHTML`/közvetlen `innerHTML`; a social-preview szövegek escape-elve vannak. Nginx CSP tiltja az inline scriptet, objektumot és beágyazást. A hozzáférési JWT localStorage-ban marad: egy esetleges későbbi XSS ebből tokent lophat, ezt a CSP nem teszi következménymentessé.
- SQL injection: a DiceMagic és checkout lekérdezései SQLAlchemyvel vagy kötött paraméterrel készülnek; az advisory lock kulcsa nem interpolált SQL. A downgrade f-stringje rögzített belső táblalistából dolgozik. Közvetlen SQLi-útvonalat nem találtam, teljes kódbázis-fuzzing nem történt.
- SSRF: a DiceMagic API originje/pathja rögzített. A partner képlinkje böngészőben renderelt hivatkozás, nem szerveroldali letöltés. A meglévő HKK-origin konfiguráció engedélyezett forrásra korlátozott, a push endpoint ellenőrzés HTTPS/host/DNS privátcím-védelmet használ. DNS-rebinding és az összes külső szolgáltató élő vizsgálata nem történt.
- Privát chat/Vault: résztvevői és tulajdonosi ellenőrzések, publikus cseremappa szűrés, valamint a teljes meglévő regressziós csomag szolgáltatott bizonyítékot. A Match algoritmus, értesítések, VP, aukciók és foglalási szabályok nem módosultak az auditban.

## Titokvizsgálat konkrét eredménye

- 602 jelenlegi követett/új forrás- és buildfájl összehasonlítása a valódi `.env` érzékeny értékeivel: **0 egyezés**. Csak kulcsnevek és számlálók kerültek kiírásra, titkos érték nem.
- Valódi `.env`/kulcsfájl a vizsgált Git-pathok történetében nem jelent meg. Ez fájlnév-alapú ellenőrzés és aktuális értékek összevetése, nem teljes történeti/entrópiás gitleaks-vizsgálat; régi, már lecserélt titkot nem zár ki.
- Helyi naplóminta: backend 392 sor, scheduler 5 sor, outbox utolsó 1000 sora. Aktuális secretérték-egyezés és hitelesítőadatot tartalmazó PostgreSQL-URL-minta: **0**. Régi/rotált naplók és Codex-transcript teljes körű átvizsgálása nem történt.
- Helyi olvasott kapcsolók: development környezet; integráció engedélyezett; valódi rendelés környezeti kapcsolója **false**, DB-kapcsolója **true**. Emiatt a valódi küldés a környezeti kapun blokkolt. Egyiket sem állítottam át.

## Az eredeti audit ellenőrzései és eredményei

| Ellenőrzés | Eredmény |
|---|---|
| Célzott audit-tesztek | **8 sikeres**; ebből 3 karakterizációs eset a jelenlegi hiányosságot bizonyítja, nem biztonsági elfogadás |
| Teljes backend | **354 sikeres**, 28 figyelmeztetés, 237,15 másodperc; a végleges 8 audit-esetet is tartalmazza |
| Teljes frontend | **320 sikeres / 60 fájl** |
| TypeScript | `npx tsc --noEmit`: sikeres |
| Production frontend build | `npm run build`: sikeres, 196 modul |
| Alembic heads/current | Egy head, mindkettő `0055_dicemagic_checkout` |
| Alembic lánc statikus ellenőrzése | 55 revízió, nincs hiányzó szülő |
| Alembic check | **Nem tiszta**, a fent leírt 4 korábbi objektumeltérés miatt |
| Dev Compose config | Sikeres |
| Production Compose config | A titokmentes `.env.production.example` példával és arra mutató `PRODUCTION_ENV_FILE` változóval sikeres; valódi helyi `.env.production` nincs, éles konfigurációt nem ellenőriztem |
| Docker | Backend, frontend, scheduler, PostgreSQL, test PostgreSQL, Redis healthy; outbox running, nincs healthcheck-státusza |
| `git diff --check` | Sikeres a vizsgált munkafán |

A frontend `act(...)` és Node localStorage tesztfigyelmeztetéseket, a backend Starlette/httpx/crypt deprecációkat és meglévő duplikált OpenAPI operation ID figyelmeztetést ad. Ezek nem teszthibák, de nem lettek elhallgatva.

Az eredeti audit három karakterizációja a hibás viselkedést várta. Az F01/F02 eseteket a javításkor átállítottam a kívánt biztonságos működésre és kibővítettem. Az F03 naplózási karakterizáció változatlanul nyitott hiányosságot jelez; annak zöld eredménye továbbra sem javítás.

## Audit által létrehozott fájlok

- `backend/tests/test_prelaunch_security_audit.py`: reprodukciók és jogosultsági regressziók.
- `docs/security-audit-2026-11-11.md`: ez a jelentés.
- `docs/security-audit-2026-11-11-dependencies.json`: 54 backend-riasztás titokmentes azonosítói/verziói.

Az eredeti audit átmeneti scanner-segédfájlja nem volt Git által követve. A javítási körben a kód szabályos, paraméterezhető CLI-ként a `backend/scripts/audit_dependencies.py` helyre került; a cache alatti régi `.py` fájlt eltávolítottam. A cache-ben csak kizárt eredményadatok/pytest-állományok maradtak. A meglévő integrációs változások megmaradtak; új migráció nem készült és nem futott.

## Következő lépés és rövid kézi tesztlista

Az F01/F02 célzott javítása felhasználói engedéllyel megtörtént. A naplómaszkolás, a további függőségi triázs/frissítés és a kiadás előtti adatkezelési/rollback-feltételek lezárása még szükséges. Valódi rendeléskapcsolót ebben a körben nem engedélyeztem.

1. Lokálisan adminnal: `http://localhost:5173/admin/integrations/dicemagic`; kizárólag konfigurációs állapotot nézz, ne engedélyezd a valódi küldést.
2. Normál/VIP/vendég módban közvetlen bolti ID, keresés és kosár ne adjon hozzáférést.
3. Mockolt rendelésnél két partner/vevő adata és chatje maradjon elkülönítve; szerepkör-visszavonás után a bolti hozzáférés szűnjön meg.
4. F01 javítása után ismételt küldés és késői timeout ne léptesse vissza az elfogadott állapotot; ne keletkezzen új ügylet vagy értesítés.
5. F02 javítása után egy ártalmatlan tiltott formátum se érje el saját parserét; JPEG/PNG/WEBP feltöltés továbbra is működjön. Támadó DoS-fájlt ne tesztelj futó szolgáltatáson.
6. A jóváhagyott adatkezelési és mentési/visszaállítási folyamatot elkülönített staging-adatokkal ellenőrizd a kiadás előtt.

## Engedélyezett F01/F02 javítás – utóellenőrzés

### Rendelési konkurenciavédelem

Az adatmodell változtatása nélkül a már tartósan tárolt `attempts` számláló lett a küldési generáció. Az első rövid sorzár alatt a kód ellenőrzi az állapotot és a kapcsolókat, növeli a számlálót, lefagyasztja a teljes payloadot, majd commitol. A hálózati hívás alatt nincs nyitva tartott rendelési sorzár, és a kérésadatokhoz sem kell lejárt ORM-objektumot visszatölteni.

A válasz feldolgozása új `SELECT ... FOR UPDATE` és `populate_existing` mellett történik:

- Az `accepted` állapotot késői negatív, hibás JSON vagy ismételt sikeres válasz sem írja felül.
- Negatív eredményt csak az aktuális generáció menthet, és csak ha a rendelés még `sending` állapotú. A régi worker nem zárhatja le az új worker függő kérését.
- A pontos külső ID-hez és változatlan összeghez kötött igazolt siker korábbi generációból is rögzíthető. Ha az újabb hívás még fut, vagy csak nem egyeztetett API-elutasítást mentett, a pozitív bizonyíték elsőbbséget kap.
- A kézzel egyeztetett elutasítás és visszavonás nem nyílik vissza: az ezekkel ütköző késői siker `dicemagic_late_acceptance_review` auditbejegyzést kap, automatikus ügylet és készletváltozás nélkül. A további partneri egyeztetés emberi feladat, nem második csere- vagy ügyletfolyamat.
- Az elfogadás, ügylet-/beszélgetéskapcsolat, kosárlezárás, audit és értesítési intent egyetlen zárolt adatbázis-tranzakcióban mentődik. A DB-rögzítés hibája nem minősül egyszerű hálózati timeoutnak: rollback után az eredeti külső ID-val lehet helyreállni.
- A külső ID és a befagyasztott rendelési payload retrykor változatlan. Új külső rendelést nem generál a helyreállítás. A partneroldali idempotencia tényleges működését nem bizonyítottam valódi rendeléssel; a kliens ugyanazt az azonosítót és tartalmat küldi.

A regressziók késői timeoutot, hibás választ, elutasítást, ismételt sikert, két generáció fordított beérkezését, egyszerre indított küldéseket és közben egyeztetett visszavonást is fednek. Ellenőrzik az egyetlen ügyletet, checkout batch-et, tételt, elfogadási értesítést és auditot, a változatlan készletblokkot, a nulla automatikus VP-jóváírást, valamint a meglévő beszélgetéskapcsolatot. A korábbi helyi tranzakcióhiba utáni idempotens helyreállítás tesztje is megmaradt.

### Képfeldolgozás és függőség

- Tényleges kiinduló runtime: Pillow **12.3.0**. Mind a fejlesztői, mind a production requirements pontos pinje **13.0.0** lett; backend Python-lockfile nem volt, frontend lockfile-t ehhez nem módosítottam.
- Az új `open_supported_image` a fájl tartalmának JPEG/PNG/RIFF-WebP szignatúrájából választ. Ismeretlen tartalom még `Image.open` előtt elutasított. Támogatott szignatúra esetén is egyetlen explicit `formats=[...]` parser engedélyezett; a teljes tartalmat továbbra is a Pillow ellenőrzi és dekódolja. A szignatúra önmagában nem jelent elfogadást.
- A kliens MIME-ja és a tényleges formátum kötelezően egyezik. SVG/GIF/BMP/TIFF/XBM vagy hamis RIFF fejléccel nem indítható nem támogatott parser. A sérült támogatott fájl kontrollált HTTP 400 hibát kap.
- A meglévő korlátok megmaradtak: **20 MiB fájl**, **10 000 × 10 000 maximális oldalméret**, **50 millió pixel**, **egy képkocka**. A fájlolvasás limit+1 bájtra korlátozott, a fejlécből megismert képdimenziókat most már a `verify`, animációszkennelés és pixeldekódolás előtt ellenőrzi a kód. A Pillow decompression-bomb figyelmeztetése hibává alakul. Ezek bemeneti/memória-munkamennyiségi korlátok; külön OS-szintű képenkénti CPU-időlimit nem került bevezetésre.
- A dekódolás második megnyitása és a social/share képek referenciafájljainak megnyitása is a közös engedélyezett utat használja. Hibás/tiltott régi referencia esetén a megosztási kép biztonságos alapképre esik vissza.
- JPEG, PNG, WebP, átlátszóság és négy generált WebP méret meglévő működése megmaradt. A regressziók kis ártalmatlan képekkel ellenőrzik a parser el nem érését, MIME-eltérést, sérülést, animációt és dekódolás előtti erőforráskorlátokat. Exploitot vagy szolgáltatást terhelő DoS-mintát nem futtattam.

### Titok- és cache-utóellenőrzés

`git ls-files 'backend/.pytest_cache/*'` nem adott követett fájlt; a cache eredményfájljait a Git továbbra is kizárja. A scanner forrása most `backend/scripts/audit_dependencies.py`, `--requirements` és `--output` paraméterekkel, a `pip-audit` valós exitkódjának megtartásával. A cache alatti ideiglenes Python-kódot eltávolítottam.

A százalékjeles kapcsolati URL előző javítását szintetikus, nem valódi hitelesítőadattal ellenőriztem: az Alembic Config round-trip sikeres, az URL nem került kiírásra. A `.replace("%", "%%")` megoldás megmaradt. **Az F03 általános naplómaszkolási hiányossága ettől nem szűnt meg**, és a korábbi helyi DB-jelszó rotációját ez a kör sem hajtotta végre. Ez további, külön lezárandó incidenskezelési/javítási feladat.

### Eredmények a javítás után

| Ellenőrzés | Tényleges eredmény |
|---|---|
| Javítás előtti két biztonságos reprodukció | Mindkettő igazolta az eredeti hibát; az unsafe viselkedést váró eredeti tesztek 2/2 sikeresek voltak |
| Javítás utáni célzott csomag | **98 sikeres**, 3 figyelmeztetés, 98,63 s; a két teszt már biztonságos viselkedést követel meg |
| Teljes backend | **384 sikeres**, 27 meglévő figyelmeztetés, 248,58 s; PostgreSQL tesztadatbázison, Pillow 13.0.0-val |
| Teljes frontend | **320 sikeres / 60 fájl**, 46,70 s |
| TypeScript és production frontend build | Sikeres; 196 modul |
| Production backend image | Lokálisan felépült `nightfall-vault-backend:security-fix-check`; hálózat nélkül, UID 10001 felhasználóval Pillow 13.0.0 és PNG→4 WebP smoke-teszt sikeres |
| Dev backend/workerek | Backend, scheduler, outbox újraépítve és lokálisan újralétrehozva; tényleges Pillow 13.0.0 |
| Production backend dependency audit | 49 csomag: **15 ismert PyJWT-riasztás**; Pillow-találat **0**; scanner exit 1 a megmaradt riasztások miatt, nem technikai auditkudarc |
| Frontend dependency audit | Production: **0**. Fejlesztői/build: továbbra is 8 érintett csomag, 5 high / 3 moderate |
| Alembic | Head/current változatlan `0055_dicemagic_checkout`; nincs új migráció. A négy ismert objektumeltérés miatt a check továbbra sem tiszta (exit 255) |
| `.env` | SHA-256 ellenőrzéssel változatlan; valódi rendelés környezeti kapcsolója kikapcsolva |
| Git | Nincs commit/push; `git diff --check` sikeres (csak meglévő Windows LF→CRLF figyelmeztetések) |

A helyi `/health/live`, `/health/ready` és `http://localhost:5173/vault` ellenőrzése HTTP 200-at adott. A backend, frontend, scheduler, PostgreSQL, test PostgreSQL és Redis healthy; az outbox running, külön healthcheck nélkül.

### Ebben a javítási körben érintett fájlok

- `backend/app/services/dicemagic.py`
- `backend/app/images/validation.py`
- `backend/app/images/processing.py`
- `backend/app/services/auction_share_image.py`
- `backend/requirements.txt`, `backend/requirements-prod.txt`
- `backend/tests/test_prelaunch_security_audit.py`
- `backend/tests/test_image_security.py`
- `backend/scripts/audit_dependencies.py`
- `docs/security-audit-2026-11-11.md`
- `docs/security-fixes-2026-11-11-dependencies.json`

**Lezárás:** az F01/F02 eredeti hibája célzottan javítva, ellenőrizhető regressziókkal. Az általános production-nyitás és az első valódi adatot továbbító próbarendelés előtt külön le kell zárni a fent felsorolt naplózási/incidenskezelési, adatvédelmi, további függőségi és visszaállítási feltételeket. A valódi rendelésküldés engedélyezése és tudatos végső megerősítése továbbra is a felhasználó/admin külön művelete.
