# DiceMagic V1 – fejlesztési állapot

Az alábbi az első fejlesztési kör történeti feljegyzése. A hiányzó checkout-,
ügylet/chat-, mennyiségi és készletfeloldási funkciók folytatásának aktuális
leírása: [dicemagic-checkout.md](dicemagic-checkout.md).

Állapot: részben megvalósítva, a teljes specifikáció még nem teljesült.
Kiinduló branch/HEAD: main / 0f93c450ef29f4b0737da52bc524d143da89ea43.

Ellenőrzések: teljes backend 321/321; teljes frontend 314/314, utolsó UI
módosítások célzott regressziója 33/33; TypeScript/production build sikeres;
Python compileall és backend import sikeres; Compose config és diff --check sikeres.
Helyi Alembic head 0054_dicemagic; az alembic check a már korábban jelzett
auctions.highest_bid_id FK, demo_auction_batches constraint/index és reports
index eltéréseknél nem tiszta. Új DiceMagic sémaeltérést nem jelzett.

A tényleges gyökér .env kulcsaival végzett olvasási próba sikeres: az API
959 terméket szolgáltatott (card és booster). Valódi rendelést nem küldtünk.
A tesztrendelési tesztek kizárólag mockolt HTTP-vel futottak.

## Érintett fájlok

Backend:
- app/core/config.py, app/main.py
- app/models/__init__.py, app/models/auction.py, app/models/dicemagic.py
- app/schemas/auction.py, app/schemas/cart.py, app/schemas/dicemagic.py
- app/api/auctions.py, app/api/social_preview.py, app/api/dicemagic.py
- app/services/auction_lifecycle.py, app/services/auction_scheduler.py
- app/services/bidding.py, app/services/cart.py, app/services/demo_visibility.py
- app/services/dicemagic.py, app/services/dicemagic_client.py
- tests/conftest.py, tests/test_dicemagic.py
- alembic/versions/0054_dicemagic.py

Frontend:
- src/App.tsx, src/api/auctions.ts, src/api/cart.ts
- src/components/AuctionCard.tsx
- src/components/DiceMagicCheckout.tsx, DiceMagicCheckout.css, DiceMagicCheckout.test.tsx
- src/pages/AuctionDetailPage.tsx, src/pages/CartPage.tsx
- src/pages/admin/AdminLayout.tsx, src/pages/admin/AdminDiceMagicPage.tsx
- src/utils/auctionPresentation.ts

Konfiguráció: .env.example, backend/.env.example. A valódi .env megőrizve.
Dokumentáció: docs/dicemagic-v1.md.

Forrás: https://dicemagic.hu/sync/v1/openapi.json (API 1.1).

## Konfiguráció és üzemeltetés

A Compose a projekt gyökér `.env` fájlját tölti be a backend és scheduler számára.
A valódi `.env` fájlt a fejlesztés nem módosítja. A hitelesítőadatok csak a
backendben használatosak, az admin API kizárólag a konfiguráltságot jelzi.

Változók: DICEMAGIC_ENABLED, DICEMAGIC_CLIENT_ID, DICEMAGIC_CLIENT_SECRET,
DICEMAGIC_SYNC_ENABLED, DICEMAGIC_SYNC_INTERVAL_SECONDS (minimum 300),
DICEMAGIC_VISIBILITY (V1 mindig admin_only), DICEMAGIC_REAL_ORDER_ENABLED.

Az env módosítását követően a szolgáltatásokat újra létre kell hozni:
`docker compose up -d --build --force-recreate backend auction-scheduler`.
Productionön ezt a fejlesztés nem hajtja végre.

Adminfelület: /admin/integrations/dicemagic. Bejelentkezett admin láthatja a
termékeket a meglévő fix áras Piactér listában és részletoldalon. A bolti
eladó dedikált, belépésre nem használható integrációs identitás.

## Elkészült részek

- Fix HTTPS origin, Basic tokenkérés, token cache, egyszeri 401 frissítés,
  timeout, tiltott redirect, titkok és külső hibaválaszok naplózásának mellőzése.
- Teljes, count-ellenőrzött snapshot import, shop_id + outer_id egyediség,
  kártyák és boosterek elkülönített metaadatai, idempotens frissítés.
- Pozitív egész HUF ár; érvényes akció kezelése. Érvénytelen ár mellett
  a termék nem vásárolható. Régi történeti adatok nem változnak.
- Üres quantity külön nem követett készlet, nulla készlet nem vásárolható.
- Admin-only listák/részletoldal/ajánlások/profilok; publikus social preview tiltás.
- Meglévő kosár használata külön admin bolti hozzáadó végponttal.
- Vásárlói adatlap, HU címvalidáció, opcionális telefon/cég/adószám,
  normál/tesztjelölés, kötelező adattovábbítási és valódi rendelési megerősítés.
- Tartós előkészített rendelés, változatlan külső ID és payload újrapróbáláskor,
  külön admin küldési művelet. A rendelés automatikusan sosem kerül elküldésre.
- Elfogadott, elutasított, sending és unknown állapotok. Backoff a bizonytalan
  eredménynél; kézi újrapróbálás. Nem jelöl fizetettnek vagy teljesítettnek.
- Automatikus termékszinkron a meglévő schedulerben, adatbázis advisory lockkal,
  minimum ötperces gyakorisággal. A hibás snapshot nem írja át a termékeket.

## Még nem teljesített elfogadási feltételek

- A kosár korábbi 1–9 korlátja megmaradt, a partner API 1–999 mennyisége
  még nem támogatott teljesen a közös kosárban.
- A bolti rendelés elfogadása még nem hoz létre meglévő AuctionTransaction
  és partner-chat kapcsolatot. A bolti rendelés az integrációs nyilvántartásban
  található, a magáneladós checkout külön, meglévő útvonalon működik.
- Vegyes kosárban nincs közös, egyetlen véglegesítési eredmény a bolti és
  magáneladós tételekre. A bolti előkészítés és végső küldés külön lépés.
- A készlet blokkolása szándékosan konzervatív: rendelés után az érintett
  termék újraértékesítése blokkolva marad. Automatikus feloldás vagy admin
  készlet-rekonsziliációs felület még nincs. Nem lehet igazolni egy snapshotból,
  hogy a partner készlete már tartalmazza a rendelés levonását.
- Részletes partner mezőhibák, teljes visszautasítás-javító UI, automatikus
  rendelés-outbox retry és teljes mobil vizuális ellenőrzés még hiányzik.
- A golden értéket nem állítjuk GFA-nak: a hivatalos séma ezt nem igazolja.
- Szállítás és számlázás különböző címe a backend sémában lehetséges, a jelenlegi
  adatlap közös címet kezel. Megjegyzés 900 karakter (tesztprefix tartalékával).

A teljes csomag ezért még nem tekinthető késznek vagy nyilvános élesítésre alkalmasnak.

## Adatkezelés és kézi teszt

A rendelési payload név/e-mail/telefon/cím/számlázás adatokat tárol és az admin
külön műveletével továbbítja a DiceMagicnek. Az integrációs rendeléslista csak
az adott admin saját rendeléseit mutatja. A személyes adatot nem szabad logolni.
Production nyitás előtt adatvédelmi és megőrzési idő felülvizsgálat szükséges.

1. Kulcsok beállítása a gyökér .env-ben, backend/scheduler újralétrehozása.
2. 0054 migráció kizárólag helyi/test DB-n; admin kapcsolatellenőrzés és szinkron.
3. Admin látja a termékeket, kijelentkezett/normál/VIP szerepkör nem.
4. Normál, akciós, elfogyott és nem követett készletű termék összehasonlítása.
5. Bolti termék a meglévő kosárba; személyes átvétel és szállítás adatlapja.
6. A normál rendelés nem kap tesztprefixet; tesztjelölés figyelmeztetést ad.
7. Valódi rendelésküldés környezeti és admin engedélye szükséges.
8. Az első valódi rendelést kizárólag a felhasználó indítsa, Zoltánnal egyeztetve.
9. Ismételt küldés ugyanazt az external_order_id-t és tartalmat használja.
10. A rendelésből blokkolt készletet ne oldjuk fel ellenőrizetlen snapshot alapján.
