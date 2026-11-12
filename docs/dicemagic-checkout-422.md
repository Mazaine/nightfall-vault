# DiceMagic checkout HTTP 422 – célzott javítás

2026. november 11. Lokális környezet, `D:\Projects\nightfall-vault`.

## Konkrét ok

A `Zén Legendái: Varázslatok` (helyi hirdetésazonosító 2040), 1 db, 690 Ft tételnél a kosár a `POST /api/cart/checkout` kérést a kötelező `shop_details` adatlap nélkül is elküldhette. A frontend a külön bolti adatlap ellenőrzését nem követelte meg a véglegesítő gombnál. A backend jogosan adott HTTP 422-t: „A bolti rendeléshez vásárlási adatlap és külön megerősítés szükséges.”

A kliens már a sikertelen kérés előtt sessionStorage-ba mentette az idempotenciakulcsot, ezért később olyan „korábbi véglegesítés” visszatöltését ajánlotta fel, amelyhez nem létezett rendelés. A hibaszöveg a nyitott modál mögött jelent meg.

A backendnaplók vizsgált mintájában hat checkout 422 válasz látszott. A vizsgálat kezdetén és az élő UI ellenőrzése után is:

- a termék kosársora aktív, 1 db, 690 Ft;
- készlet: 32, nincs készletblokk;
- nincs kapcsolódó rendelés-előkészítési intent, DiceMagic-rendelés vagy ügylet;
- az összes helyi DiceMagic-rendelés száma 0.

A böngészős ellenőrzéskor a kosárban már egy második bolti tétel is szerepelt; azt nem az ellenőrzés adta hozzá, és nem módosítottam.

## Végpont és javítás

A `/api/cart/checkout` **a megfelelő közös végpont**, mert a bolti és a magáneladós tételeket együtt, eladónként elkülönítve kezeli. A kizárólag bolti `/api/admin/integrations/dicemagic/orders/prepare` alternatív adminvégpont marad; a kosarat nem irányítottam át olyan folyamatra, amely kihagyná a magáneladókat.

- A bolti adatlap most a véglegesítő modál része. A végső gomb csak sikeres adatellenőrzés után használható.
- Az adatok módosítása érvényteleníti a korábbi kliensoldali ellenőrzést; újra jóvá kell hagyni az aktuális adatlapot.
- A „Bolti adatok ellenőrzése” csak kliensoldali lépés, nem sugallja, hogy már rendelést készített a szerveren.
- A szerverhibák a modál fejlécében látszanak, nem a háttérben. A 422-es válasz után nem marad fiktív függő rendelésként megjelenített kliensjelölés; ugyanaz a kulcs újrapróbálható. Hálózati/5xx hibánál a kulcs megmarad a biztonságos helyreállításhoz.
- Egy korábban félbeszakadt, még rendeléshez nem kapcsolt intent visszatöltése hiányzó adatlapnál szintén érthető 422-t ad, nem belső validációs 500-at.
- **A helyi előkészítés különvált a valódi küldés engedélyétől.** Az admin, az aktív integráció, az érvényes adatlap és a tudatos jóváhagyás továbbra is szükséges. A helyi előkészítés akkor is létrejöhet, ha a valódi küldés tiltott. A `send_order` környezeti és adatbázisbeli kapcsolója, valamint az admin API kérésszintű megerősítése változatlan. Előkészítés nem küld partner-HTTP-kérést és nem hoz létre teljesített ügyletet.
- Bolti, `queued` eredménynél a felület „Bolti rendelés előkészítve” visszajelzést ad, a még el nem küldött állapotot és termékösszeget külön jelzi.

## Mobilos ellenőrzés

Élő, bejelentkezett helyi böngészőben 390×844 és 768×1024 viewporttal történt ellenőrzés. A 390 px széles nézetben a modál 358×812 px, minden széle a viewporton belül van. A belső tartalom görgethető, a fejléc és a műveleti terület külön marad, vízszintes túlcsordulás nincs. A végleges előkészítő gomb az adatlap ellenőrzéséig tiltott, szerkesztés után ismét tiltottá válik.

A böngészőben kizárólag szintetikus adatlap kliensoldali ellenőrzése történt. A szerveroldali előkészítő gombot nem nyomtam meg; a modált bezártam, a szintetikus mezők eltűntek és a viewport-felülírást visszaállítottam. A sikeres szerveroldali előkészítést csak az izolált tesztadatbázison ellenőriztem.

## Regressziók és eredmények

- Backend célzott: **27 sikeres** a DiceMagic checkout csomagban.
- Teljes backend: **386 sikeres**, 27 meglévő figyelmeztetés.
- Frontend célzott: **12 sikeres**, valódi bolti űrlapkomponenssel, nem annak helyettesítésével.
- Teljes frontend: **323 sikeres**, 0 hibás teszt. TypeScript és production build: sikeres.
- `git diff --check`: sikeres; a korábbi Windows sortörés-figyelmeztetések megmaradtak.

Új backendtesztek: a pontos terméknév/ár/mennyiség, mellékhatásmentes 422, előkészítés letiltott küldés mellett, mindkét független küldési kapu, azonos kulcsos visszatöltés és félbeszakadt intent helyreállítása. Frontenden a hiányzó adatlap, módosítás utáni újraellenőrzés, valós kitöltött payload, elavult klienskulcs, modálon belüli szerverhiba és queued visszajelzés tesztelt.

## Érintett fájlok

- `backend/app/services/dicemagic.py`
- `backend/app/services/dicemagic_checkout.py`
- `backend/tests/test_dicemagic_checkout.py`
- `frontend/src/pages/CartPage.tsx`
- `frontend/src/components/DiceMagicCheckout.tsx`
- `frontend/src/components/DiceMagicCheckout.css`
- `frontend/src/styles/cart.css`
- `frontend/src/pages/CartPage.dicemagic.test.tsx`
- ez a dokumentum és a checkout-folyamat rövid dokumentációs kiegészítése.

Új migráció nincs. Meglévő rendelési adat nem lett átírva/törölve; a `.env` változatlan, a valódi küldési környezeti kapcsoló kikapcsolva maradt. Nem történt valódi rendelésküldés, commit, push vagy deploy. A korábbi biztonsági audit további nyitott feltételei nem változtak.
