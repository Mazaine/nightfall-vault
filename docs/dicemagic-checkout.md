# DiceMagic – ügylet, vegyes kosár és készletegyeztetés

Aktuális, egyszerűsített kosárfolyamat: [dicemagic-cart-ordering.md](dicemagic-cart-ordering.md).
Ez felváltja az alábbi történeti, külön adminoldali küldést leíró felhasználói lépéseket.

2026-11-11-i checkout 422 javítás: [dicemagic-checkout-422.md](dicemagic-checkout-422.md).
A bolti adatlap a véglegesítő modálban kötelező; a helyi `queued` előkészítéshez
nem kell engedélyezni a valódi rendelésküldést. A partnernek történő küldéshez
továbbra is szükséges a környezeti kapcsoló, az admin DB-kapcsoló és a külön
kérésszintű tudatos megerősítés. A közös kosárvégpont továbbra is `/api/cart/checkout`.

Ez a dokumentum a V1 első fejlesztési körének folytatását írja le. A tényleges
gyökér `.env` változatlan maradt. A fejlesztés nem küld valódi partner-rendelést,
nem commitol, nem pushol, és nem módosít production adatot.

## Meglévő ügylet és közös beszélgetés

Egy API által elfogadott DiceMagic-rendelés pontosan egy meglévő
`AuctionTransaction` rekordhoz kapcsolódik. Tételei az eredeti
`AuctionTransactionItem` modellben szerepelnek. Az ár és mennyiség a tartósan
előkészített rendelésből származik, nem az időközben változó katalógusból.
A meglévő eladási pillanatkép-logika őrzi a korábbi termékoldalt; az élő bolti
hirdetés és a régi tranzakciók nem íródnak át.

A `DiceMagicOrder.transaction_id` egyedi kapcsolat, az elfogadási állapottal
azonos adatbázis-tranzakcióban mentve. Külső elfogadás utáni helyi hiba esetén
a tartós `sending` állapot, az eredeti external_order_id és payload marad meg.
Az idempotens ismétlés után egy ügylet és egy értesítés jön létre.

A `Saját ügyleteim` és a partnerenkénti elszámolás a meglévő adatokat olvassa.
Az `ensure_transaction_conversation` ugyanazt a vevő–DiceMagic beszélgetést
használja a későbbi rendelésekhez is. Más partner vagy admin nem fér hozzá.
Adminjog visszavonásakor a bolti termék, ügylet és beszélgetés nem olvasható.

Az elfogadott rendelés **nyitott ügylet**. Nem kap automatikus fizetési vagy
teljesítési megerősítést, készletlevonást a privát Vaultból vagy VP-jutalmat.
A meglévő kétoldalú megerősítés, értékelés és VP-logika marad érvényben.
A fizetést és szállítást a DiceMagic saját webshopja kezeli. A Nightfall chat
nem továbbít automatikusan üzeneteket a DiceMagic API-n keresztül.

## Vegyes kosár és külön küldés

A közös Cart/CartItem modell változatlanul kezeli mindkét forrást. A vegyes
checkout tartós előkészítési tervet tárol a vevőhöz és idempotenciakulcshoz:
eredeti tételazonosítók, mennyiségek, árak, belső eredmény és bolti rendelés.
Ez feldolgozási terv, nem második ügyletkezelő rendszer.

A magáneladók tételeit a korábbi atomikus, eladónkénti checkout véglegesíti.
A DiceMagic-rendelés csak előkészül, és `queued` marad. Az automatikus
jóváhagyási ellenőrzés miatt a közös checkout nem hívja az orders API-t.
A küldés az adminoldalon, tételes összesítő és külön megerősítés után történik.

A kosár `pending` / `partial` / `completed` eredményt mutat. A sikeres összeg
csak ténylegesen létrejött ügyletekből számolódik. A bolti függő/elutasított
eredmény és a magáneladós hiba külön látható. A sikeres tételek kikerülnek,
a függők megmaradnak, és előkészítés után nem szerkeszthetők észrevétlenül.
Az eredményfrissítés nem küld külső rendelést, és nem ismétel meg belső eladást.
A böngésző sessionStorage csak a helyreállítási kulcsot tárolja, személyes adatot nem.

## 1–999 bolti darabszám

Az új feltételes adatbázis-korlát a `shop_source='dicemagic'` tételeknél enged
1–999 darabot. A normál kosár- és ügyletsorok továbbra is 1–9 közöttiek.
Mind az API, mind az adatbázis külön ellenőrzi ezt; a normál mennyiségi
szabály nem lett globálisan 999-re emelve. A bolti tag szerveroldalon kerül rá
a sorra, a publikus kliens nem adhatja meg tetszőlegesen.

A nem követett készlet továbbra is NULL, nem kitalált végtelen vagy 999 darab.
Ilyenkor a 999 rendelési limit, és a partner végleges rendelésvalidációja dönt.
Bolti áremelkedést és árcsökkenést is külön el kell fogadni; a korábbi
magáneladós árszabályok megmaradtak.

## Biztonságos készletfeloldás

Előkészítéskor rendelésenként és termékenként tartós készletblokk készül,
a rendelés előtti elérhető mennyiséggel. A blokkokat a szinkron nem oldja fel.

Az adminoldali egyeztetés megköveteli:

- a saját rendeléshez való admin-hozzáférést;
- a partnernél ellenőrzött rendelésállapotot és annak hivatkozását;
- a küldés/előkészítés utáni, legfeljebb 15 perce letöltött API-snapshotot;
- a pontos snapshot tokent és a szerver által tárolt készlettel egyező értéket;
- elfogadott státusznál az API-val igazolt elfogadást és a meglévő ügyletet.

Követett készletnél a maradék legfeljebb az eredeti készlet mínusz a rendelt
mennyiség lehet. A készletet nem vonjuk le újra a már csökkent partner-snapshotból.
Nulla készletből nem lesz elérhető termék. A feloldás után készletplafon marad,
ezért egy későbbi nagyobb, elavult snapshot nem nyitja vissza a már rendelt részt.
Ez igazolt későbbi készletfeltöltésnél konzervatívan alacsonyabb elérhetőséget
okozhat; ilyen helyzet külön partneri felülvizsgálatot igényel.

Nem követett készletnél nincs számszerű levonás vagy kitalált plafon. Csak
eredetileg is nem követett készlet és friss változatlan típusú API-adat mellett
engedélyezhető a partnerrel igazolt rendelhetőség. Követett készlet nem válthat
ismeretlenre a védelmi plafon megkerüléséhez.

Ismeretlen kimenetelt nem lehet pusztán egy pipával elfogadottnak nyilvánítani:
előbb az eredeti rendelés idempotens ismétlése szükséges. A partnerrel igazolt
elutasítás/visszavonás terminális állapot, nem küldhető el újra. Az egyeztetés
adminazonosítóval, időponttal, snapshotazonosítóval és hivatkozással auditált.

## Migráció és ismert sémaeltérések

Új head: `0055_dicemagic_checkout`, előzménye `0054_dicemagic`.
A 0051–0054 lánc megmarad. A migráció a shop-tag nélküli régi ügyletsorokat
és mennyiségeiket nem módosítja. A már előkészített bolti rendelések blokkjait
adatmegőrző módon létrehozza. A visszamigrálás megtagadott, ha 9 feletti bolti
mennyiség miatt veszteséges lenne.

A meglévő helyi public sémán az `alembic check` korábban ismert eltérései:

- `auctions.highest_bid_id`: az FK ON DELETE beállítása eltér;
- `demo_auction_batches_batch_key_key`: régi extra egyediség;
- `uq_demo_auction_batches_single_live`: régi extra index;
- `ix_reports_created_at`: régi extra index.

Új DiceMagic sémaeltérést az összehasonlítás nem jelez. Ezeket a régi
objektumokat ez a feladat nem törli és nem alakítja át automatikusan.
Az Alembic URL-konfiguráció %-escape-et kapott az URL-kódolt paraméterekhez.

## Rövid manuális teszt

1. Admin: `/admin/integrations/dicemagic`; a valódi rendelésküldést fejlesztői
   ellenőrzéskor hagyd kikapcsolva. Normál/VIP/kijelentkezett látogató ne lásson bolti adatot.
2. Bolti lapon 1, 9, 10 és 999 mennyiség (a tényleges készlet erejéig), normál
   hirdetésen változatlan 1–9. Nem követett készlet ne jelenjen meg darabszámként.
3. Két eladós kosár: vásárlói adatlap, tételes előnézet, külön függő bolti eredmény.
4. Oldalfrissítés után korábbi véglegesítés visszatöltése; ne jöjjön létre új kulcs/rendelés.
5. Csak izolált HTTP-mockkal: timeout, 409, 403, 500 és elfogadott/duplicate válasz.
   A sikeres magáneladós ügylet maradjon meg, a bolti eredmény ne legyen téves siker.
6. Elfogadás után két rendelés egy partnerbeszélgetésben, helyes tételek és elszámolás;
   nincs automatikus fizetési/teljesítési megerősítés.
7. Készletegyeztetés: hiányzó bizonyíték, régi/módosult snapshot és túl nagy készlet tiltott;
   a helyes maradék és nulla készlet kezelése, későbbi elavult snapshot ne növeljen készletet.

Az első valódi rendelést továbbra is kizárólag a felhasználó indíthatja külön,
Zoltánnal egyeztetve. A partner API nem ad rendelésállapot-lekérő vagy visszavonó
végpontot; a manuális bizonyíték hitelessége adminisztrátori felelősség.

## Ellenőrzési eredmények és érintett fájlok

- Teljes backend pytest: 345 sikeres teszt; a végső konkurens előkészítési
  esetet is tartalmazó DiceMagic-checkout csomag külön 25/25 sikeres teszttel.
- Teljes frontend Vitest: 60 fájl, 320 sikeres teszt.
- Külön TypeScript-ellenőrzés és production build: sikeres.
- Python compileall, backend import, Compose config és git diff --check: sikeres.
- 0054 → 0055 frissítés helyi és izolált test DB-n: sikeres.
- Új, adatmentes sémán bootstrap → 0054 vissza → 0055 előre → alembic check: sikeres.
  Ez nem a teljes régi történeti migrációs lánc újrajátszása; a projekt üres
  adatbázisnál metadata-bootstrapot és head-stampet használ.
- A meglévő public sémán csak a fent felsorolt korábbról ismert eltérések maradtak.

Az aktuális kör fő változásai:

- `backend/alembic/env.py`, `backend/alembic/versions/0055_dicemagic_checkout.py`;
- `backend/app/models/cart.py`, `transaction.py`, `dicemagic.py`, `__init__.py`;
- `backend/app/services/cart.py`, `dicemagic.py`, `dicemagic_checkout.py`,
  `dicemagic_transactions.py`, `dicemagic_reconciliation.py`, `transactions.py`,
  `transaction_conversations.py`;
- `backend/app/api/cart.py`, `dicemagic.py`, `backend/app/schemas/cart.py`;
- `backend/tests/test_dicemagic.py`, `test_dicemagic_checkout.py`;
- `frontend/src/api/cart.ts`, `utils/auctionPresentation.ts`,
  `pages/CartPage.tsx`, `pages/AuctionDetailPage.tsx`;
- `frontend/src/components/DiceMagicCheckout.tsx`, `DiceMagicReconciliation.tsx`;
- `frontend/src/pages/admin/AdminDiceMagicPage.tsx` és az új frontend regressziós tesztek;
- `docs/dicemagic-checkout.md` és a V1 történeti dokumentum hivatkozása.

A tényleges `.env` fájlt a munka nem írta át. Egy izolált migrációteszt
konfigurációs hibájának kimenete egyszer a helyi DB kapcsolati URL-jét tartalmazta;
a helyi DB-jelszó cseréje javasolt. DiceMagic-kulcsot nem írtunk ki.
