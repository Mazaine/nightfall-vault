# Intelligens eladói készletkezelő V1

Lokális fejlesztés, 2026-11-21. Nincs commit, push, deploy vagy production-adatmódosítás. A `.env` változatlan; valódi DiceMagic-rendelés nem történt.

## Elérés és működés

- Hirdetésfeladás: `/auctions/create?type=fixed`, `/auctions/create?type=auction`, harmadik fül: `/inventory`.
- Mobilon: Fix áras / Aukció / Készlet. Az oldal minden aktív, eladásra jogosult felhasználónak ingyenes; nem VIP-funkció.
- Saját fix áras, egyedi hirdetések: név/HKK ID, kiadás, változat, állapot, forrás, státusz és retró szerinti keresés. Desktop táblázat, mobil kártyás nézet, 50 tételes lapozás.
- A szabad, foglalt és nyitott ügyletben lévő mennyiség külön látható. A nyitott ügylet példányai már nem tartoznak az eladható készlethez.
- Új CSV-forrás, átnevezés, mentett oszlopmegfeleltetés, forrásfrissítés, teljes egyeztetés, export és forrásáthelyezés.
- Előzmények: importok, tömeges módosítások és exportok, 50 műveletes lapozás. Importelőnézetben korábbi és tervezett értékek; adatbázisban tartós régi/új állapotnapló.

## Egyetlen készletforrás

A mennyiség továbbra is az `auctions.vault_quantity` mezőn található. Új párhuzamos termék-, kosár-, ügylet- vagy chatrendszer nem készült. A négy új tábla csak forráskapcsolatot, import-/változásnaplót és nyilvános HKK-metaadat-cache-t tárol.

Önálló fix áras készletnél megszűnt a 9 darabos korlát: létrehozás, szerkesztés, import, kosár és checkout nagyobb mennyiséget is kezel. A technikai maximum PostgreSQL `integer`: 2 147 483 647 db; a checkout végösszegét a meglévő elszámolási mező tartománya védi. Nagy készletnél számbemenet jelenik meg több ezer `<option>` helyett.

A DiceMagic 999-es korlátja és külön vásárlási folyamata változatlan. A Vaultból meghirdetett készlet mennyisége továbbra is a Vaultban kezelhető; kapacitási és változati szabályait nem lazítottuk. Aukciók licitszabályai változatlanok.

Importált/új önálló készletnél részleges és teljes vásárlás is külön történeti eladási pillanatképet használ. A készlet eredeti azonosítója megmarad; elfogyáskor a forráshirdetés 0 darabbal inaktívvá válik, ezért később ugyanaz a készlet tölthető fel újra. A korábbi tranzakciók árait és mennyiségeit nem írjuk át.

Saját fotónál az eladási pillanatkép független médiapéldányokat kap. A forráshirdetés későbbi képcseréje így nem változtatja meg a korábbi vásárlás fotóját. Sikertelen checkout/rollback/sessionbezárás után az új, még nem véglegesített másolatok törlődnek; a forrásfotók megmaradnak. Hiányzó vagy nem olvasható saját fotó esetén a vásárlás visszagörgethető hibával megáll.

## Import és mintafájl

1. Hozz létre és válassz ki egy CSV-forrást.
2. Tölts fel fájlt. Ez kizárólag előnézetet hoz létre, nem publikál.
3. Ellenőrizd az oszlopokat, az árakat és a pontos lapkiadást.
4. A hiányzó neveket a meglévő HKK-lapkeresőből, tízes kötegekben ellenőrizheted. A kötegek a már ellenőrzött, többértelmű neveken is továbblépnek. Több találatnál kép, kiadás és HKK ID alapján válassz; ID kézi beírása nem kötelező.
5. Az ütköző sorokat javítsd, kapcsold meglévő hirdetéshez, hagyd ki, vagy adj meg igazoltan külön fizikai készletcsoportot.
6. A **Hibátlan sorok feltöltése** művelet egyetlen jóváhagyással végigmenti az összes alkalmazható sort, legfeljebb 200-as tranzakciós kötegekben. Kijelölés esetén csak a kijelöltek kerülnek mentésre. A folyamat később folytatható; a már alkalmazott sor nem fut le kétszer.

Mentés után az ellenőrzési listában csak a még nem alkalmazott sorok maradnak, lapozva. Az eredeti CSV-sorazonosítók megmaradnak, ezért a szűrt lista javítása és kijelölése sem módosíthat másik sort. A már feldolgozott tételek a **Már feltöltött sorok megjelenítése** kapcsolóval visszanézhetők; az importnapló nem törlődik. Ez a részleges feltöltés nem inaktivál hiányzó tételeket.

A részleges feltöltés kiegészítésének ellenőrzése: 24 célzott backendteszt, a teljes frontendkör 380 tesztje, TypeScript, production build, Python compileall és `git diff --check` sikeres. A tesztek a szűrt lista eredeti sorazonosítóit, a jó/hibás sorok szétválasztását és a 200 sornál nagyobb, egy jóváhagyással végigfutó mentést is lefedik. Új migráció nem szükséges.

Támogatott formátumok:

- UTF-8/BOM CSV, pontosvessző, vessző vagy tabulátor, szabályos idézőjelezéssel.
- A specifikációban megadott HKKPiac-séma: `name;graphic_type;quantity;price;card_id`. A `normal`, `foil`, `FA`, `GFA` kis-/nagybetűi normalizálódnak. A külső oldal dokumentációja a fejlesztési ellenőrzés során nem volt elérhető; az ötmezős séma kompatibilitását fixture-ök igazolják, külső szolgáltatásba való feltöltést nem állítunk igazoltnak.
- Nightfall CSV v1: `stock_item_id`, `listing_id`, `source_id`, `card_id`, `name`, `edition`, `graphic_type`, `condition`, `quantity`, `price`, `retro`, `status`, `version`, `physical_group`, `export_id`.
- Egyéb CSV: saját, forrásonként megőrzött oszlopmegfeleltetés.
- Egy munkalapos XLSX: az olvasó nem futtat képleteket, makrókat vagy külső hivatkozásokat. A feltérképezett adatmezőben lévő képlet javítandó sor; figyelmen kívül hagyott összegoszlop képlete nem egységár.

A felhasználói `Gyujtemeny (1).xlsx` fájlon a tényleges olvasó felismerte a 4. sori, D:H fejlécet. A `Kartya neve`, vegyes foil/kiadási év, darabszám és **Ar per db (HUF)** mezőket használja. A darabszámmal felszorzott ár nem egységár. 867 nem üres adatsor közül 11 sor javítandó; ezek nem kerültek hirdetésbe. A mintafájlt nem módosítottuk, és nem alkalmaztuk valódi eladói készletre.

Alapkorlát: 5 000 000 bájt / 10 000 sor. Beállítások: `INVENTORY_CSV_MAX_BYTES` és `INVENTORY_CSV_MAX_ROWS`; felső technikai védőkorlát 20 MB / 50 000 sor. Az API az aktuális értékeket adja a felületnek. XLSX esetén külön 50 MB kicsomagolt méret-, 200 ZIP-bejegyzés- és 128 oszlopos korlát is van. Ezek importonkénti korlátok, nem a teljes készlet méretét korlátozzák.

## Ütközések, egyeztetés és visszavonás

- A CSV darabszáma szabad készletet jelent. A megmaradt aktív foglalások példányai nem szabadulnak fel importtól.
- Korábbi CSV 20, időközben eladva 5: ugyanaz a fájl újra feltöltve **15-öt őriz meg**. Az előnézet ezt külön jelzi, nem állítja mentendő mennyiségnek a CSV régi 20-as számát.
- Az új 18-as érték explicit készletütközés-feloldást igényel. Import és vásárlás között a hirdetési sorzár és a friss állapotverzió védi a készletet.
- Azonos lap/kiadás/változat/állapot nem adódik össze automatikusan több CSV-ből. Egy készletnek egy elsődleges frissítési forrása van. Másik forráshoz áthelyezés csak jóváhagyással történik.
- A kézi/fényképes hirdetéshez kapcsolás explicit. Más eladó vagy DiceMagic készlete nem módosítható; moderált hirdetés nem szerkeszthető ezzel az eszközzel.
- A hibás és kétértelmű sorok nem alkalmazhatók, a független érvényes sorok igen. Teljes forrásegyeztetéshez viszont minden sor alkalmazása szükséges; kihagyott vagy hibás sor mellett nincs hiányzó-tétel inaktiválás.
- A hiányzók kikapcsolása külön, második jóváhagyás. Csak státuszváltozás történik, készlet nem törlődik.
- Nightfall fájlnál az `export_id` a szerveren rögzített teljes/részleges exportterjedelemhez kapcsolódik. A teljes export tudatos szerkesztése és sorok elhagyása megengedett, a külön készített kijelölt/részleges export nem használható teljes egyeztetésre. Az export óta megváltozott forrástagság új teljes exportot igényel. Régi, igazolhatatlan Nightfall-exportból sorok frissíthetők, de hiányzók nem kapcsolhatók ki.
- Külső CSV-nél a felhasználó a teljes forrásként megjelöléssel vállalja a teljességet; a rendszer a fájl érvényességét, azonosíthatóságát, forrásait és friss készletállapotát ellenőrzi.
- Visszavonás csak külön előnézet és jóváhagyás után: új hirdetés inaktiválása, korábbi ár/készlet/státusz/forráskapcsolat visszaállítása. Későbbi vásárlás, foglalás, ügyletváltozás vagy szerkesztés blokkolja a visszavonást.

Tömeges árazás: beállítás, hozzáadás, levonás, százalékos emelés/csökkentés; pozitív egész Ft, `ROUND_HALF_UP`. Készlet: beállítás, növelés, csökkentés. Retró, státusz és forrás is módosítható. Ármódosítás önmagában nem kapcsolja be/ki a hirdetést.

Az export teljes saját készletre, egy forrásra vagy kijelölésre kérhető. Inaktív és nullás tételek külön kapcsolhatók. Nem tartalmaz vásárlói adatot, címet, privát üzenetet vagy titkot; Excel-formulaként értelmezhető szövegek védett cellaként kerülnek ki.

## Migráció és ellenőrzések

Új head: `0057_seller_inventory`, szülő: `0056_dicemagic_lifetime_vip`. A korábbi 0054/0055/0056 migrációk változatlanok. Az új migráció nem töröl felhasználói adatot. Downgrade előtt ellenőrzi az új táblákat és az új mennyiségeket; nem férő vagy meglévő készlet esetén megtagadja a visszalépést.

A helyi adatbázison az upgrade lefutott. A teljes migrációs láncot új, elkülönített tesztadatbázison is futtattuk; nem metadata-stamp helyettesítette az upgrade-et.

Az `alembic check` továbbra sem tiszta: kizárólag a négy korábban ismert eltérés maradt:

1. `auctions.highest_bid_id` FK: adatbázis NO ACTION, modell SET NULL.
2. `demo_auction_batches_batch_key_key` extra unique.
3. `uq_demo_auction_batches_single_live` extra unique index.
4. `ix_reports_created_at` extra index.

Nem készült ezek eltávolítására automatikus migráció. Ez a fejlesztés nem jelent élesítési jóváhagyást.

Végső eredmények:

- Teljes backend: **421 sikeres teszt**, a saját fotókat megőrző javítással együtt. Az ezt követő utolsó célzott készletkezelő kör **23 sikeres teszt**, a korábban eladott forrástételek exportegyeztetésével is. Benne párhuzamos import/checkout, teljes/részleges import, HKK-azonosítás, exportmanifest, régi CSV, IDOR, foglalás, moderáció-/DiceMagic-készletvédelem és a fotómásolatok rollbackje.
- Teljes frontend: **358 sikeres teszt / 66 fájl**. Új célzott esetek: navigáció és készletlista, feltöltés csak előnézetként, külön megerősítés/Mégse, oszlopmegfeleltetés, tömeges árazás, kijelölt export, biztonságos visszavonás és nagy mennyiségi bemenet.
- TypeScript `tsc --noEmit`: sikeres. Production build: sikeres.
- Python `compileall`, API-import, valódi lifespan startup/health/shutdown, Docker Compose-konfiguráció: sikeres.
- Teljes migrációs lánc új DB-n; üres 0057 downgrade/upgrade; adatot tartalmazó downgrade biztonságos megtagadása: sikeres.
- `git diff --check`: sikeres. A fenti négy ismert Alembic-sémaeltérés megmaradt; az `alembic check` emiatt nem nulla kilépésű.
- Maradtak meglévő deprecation/React `act` figyelmeztetések és a korábbi social callback OpenAPI operation ID figyelmeztetés; teszthiba nem maradt.

Vizuális ellenőrzés izolált, mintaadatokat adó API-val: 1920, 1440, 1280, 1024, 768 és 390 px; nem volt dokumentumszintű vízszintes túlcsordulás. Mobilon a megerősítőablak és a tömeges ármódosítás is ellenőrizve. Az ideiglenes vizuális tesztkönyvtárat eltávolítottuk.

## Érintett fájlok

- Backend új: `app/api/seller_inventory.py`, `app/models/seller_inventory.py`, `app/services/seller_inventory.py`, `app/services/stock_csv.py`, `app/services/stock_photo_snapshots.py`, `alembic/versions/0057_seller_inventory.py`, `tests/test_seller_inventory.py`.
- Backend meglévő: `app/main.py`, `app/core/config.py`, `app/api/auctions.py`, `app/models/__init__.py`, `app/models/auction.py`, `app/models/cart.py`, `app/models/transaction.py`, `app/schemas/auction.py`, `app/schemas/cart.py`, `app/services/auction_lifecycle.py`, `app/services/cart.py`, `tests/test_dicemagic_checkout.py`.
- Frontend új: `src/api/inventory.ts`, `src/pages/SellerInventoryPage.tsx`, `src/pages/SellerInventoryPage.css`, `src/pages/SellerInventoryPage.test.tsx`, `src/components/SellingNavigation.tsx`, `src/components/QuantityInput.tsx`, `src/components/QuantityInput.test.tsx`.
- Frontend meglévő: `src/App.tsx`, `src/api/auctions.ts`, `src/components/ListingComposer.tsx`, `src/components/FixedPurchaseDialog.tsx`, `src/pages/AuctionCreatePage.tsx`, `src/pages/AccountPage.tsx`, `src/pages/AuctionsPage.tsx`, `src/pages/CartPage.tsx`.
- Ez a dokumentum.

## Rövid manuális próba

1. Lokális backend és frontend indítása után jelentkezz be, nyisd meg a `http://localhost:5173/inventory` oldalt.
2. Hozz létre tesztforrást, töltsd fel a mintafájlt, ellenőrizd a 4. sori megfeleltetést és az egységárat. A 11 javítandó sort és a többértelmű kiadásokat külön rendezd.
3. Először néhány tesztlapot hagyj jóvá. Ismételt feltöltésnél ellenőrizd a változatlan sorokat; valódi DiceMagic-rendelést ne indíts.
4. Egy kijelölt lapon készíts 20%-os árelőnézetet, majd próbáld a Mégse gombot és a jóváhagyást.
5. Készíts teljes forrásexportot az inaktív és nullás tételekkel, majd részleges kijelölt exportot is. Ellenőrizd az eltérő teljes-egyeztetési jogosultságot.
6. Az előzményekben ellenőrizd a visszavonást. Vásárlás/szerkesztés után az elavult visszavonásnak blokkoltnak kell lennie.
7. Piactér Aukciók és Lapok fül: Csak retró lapok, további szűrő és lapozás együtt.
