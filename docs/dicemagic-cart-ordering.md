# DiceMagic – rendelés közvetlenül a kosárból

**Utólagos konfigurációváltozás (2026-11-11):** a felhasználó kifejezett engedélyével
a gyökér lokális `.env` fájlban `DICEMAGIC_REAL_ORDER_ENABLED=true` lett,
és a backendkonténer újra létrejött az új környezet betöltéséhez. Ez felülírja
az alábbi történeti leírás kikapcsolt környezeti kapcsolóról és változatlan `.env`-ről
szóló állításait. Rendelésküldést nem indítottunk; az adminjogosultság és a rendelésenkénti
tudatos megerősítés továbbra is kötelező. Ez nem production deploy vagy élesítési jóváhagyás.

2026-11-11. Lokális fejlesztés; valódi partner-rendelés küldése nélkül.

## Aktuális folyamat

Kosár → Véglegesítés → bolti adatok és kifejezett hozzájárulás → Megrendelem.
Egyetlen ablak, nincs külön adatellenőrző gomb, előkészítési lépés vagy adminoldali navigáció.
A magáneladós véglegesítés változatlan. A bolti adatok böngészőben ellenőrződnek,
de a backend ellenőrzései továbbra is kötelezők.

Az egyetlen felhasználói művelet a meglévő vegyes checkoutot, majd a meglévő
adminjogosultsággal védett küldési végpontot használja. Az integráció, az adatbázisbeli
rendelési kapcsoló és a környezeti küldési kapcsoló ellenőrzése még a helyi előkészítés
előtt megtörténik. A backend küldési védelme megmarad. A felület nem állítja át a kapcsolókat.

Sikeres visszaigazoláskor a modál bezárul. Bizonytalan vagy hibás eredmény nem kap
sikeres státuszt. A szerverhiba az ablakban látszik. Hálózati hiba esetén a kulcs
megmarad; újraküldés csak újabb tudatos megerősítéssel, ugyanarra a rendelésre történik.
Az állapotfrissítés nem hívja a küldési végpontot. A fizetés és szállítás továbbra is a bolt feladata.

## Félbeszakadt rendelés

A saját kosár API-ja az aktív, függő bolti tételekhez kapcsolódó saját checkout
kulcsát visszaadja (`checkout_resume_key`). Másik admin vagy normál felhasználó
nem kapja meg. Nincs adatmodell-változás vagy migráció.
Új böngészőfülben is elérhető a Rendelés folytatása: ugyanazon rendelés áttekintő
ablakát nyitja meg, küldés nélkül. A Megrendelem új megerősítést igényel.

## Biztonsági határok

- DiceMagic továbbra is admin-only; nem vált nyilvánosan rendelhetővé.
- Nincs automatikus újrapróbálkozás vagy új külső rendelésazonosító.
- A meglévő monoton állapotátmenetek és idempotens szerveroldali védelem változatlan.
- A `.env`, a meglévő rendelésadatok és a valódi küldési engedélyek változatlanok.
- A környezeti valódi küldési kapcsoló helyben kikapcsolva maradt.

## Regressziók

Valódi frontend űrlappal: vegyes kosár egygombos rendelése; kötelező adatok és
hozzájárulás; 690 Ft-os termék; 999-es bolti mennyiség; három külön küldési kapu;
válaszvesztés és azonos kulcsos kézi újrapróbálkozás; állapotfrissítés küldés nélkül;
új fülből folytatás; elavult 422-es kulcs; visszalépés mellékhatás nélkül.
Backend: a saját függő kulcs visszatöltése, partnerelkülönítés és elfogadás után eltűnő
folytatási kulcs. Partner-HTTP a tesztekben tiltva/helyettesítve.

## Lokális ellenőrzés

- Teljes backend: 387 sikeres teszt, 27 meglévő figyelmeztetés.
- Célzott rendelési és biztonsági backendcsomag: 45 sikeres teszt.
- Teljes frontend: 329 sikeres teszt, 0 hibás (`--maxWorkers=2`). TypeScript és production build: sikeres.
  Egy korábbi, nagy párhuzamosságú futás az értesítési tesztben időzítési hibával zárult;
  az értesítési kód és teszt változtatása nélkül a korlátozott és a végső futás sikeres.
- Élő, bejelentkezett kosár: Rendelés folytatása közvetlenül az összesítőt nyitja.
- Mobil: 390×844 viewport, 358 px széles összesítő, nincs vízszintes túlcsordulás.
  A modál átlátszatlan Nightfall-hátteret kapott az olvashatósághoz.
- A meglévő helyi rendelés az ellenőrzés után is `queued`, `attempts=0`, ügyletazonosító nélkül.
- `git diff --check`: sikeres; két korábban módosított requirements fájlnál Windows sortörés-figyelmeztetés.
- Új migráció, commit, push, deploy és valódi rendelésküldés nincs.

Érintett fájlok ebben az egyszerűsítési körben:

- `backend/app/schemas/cart.py`, `backend/app/services/cart.py`, `backend/tests/test_dicemagic_checkout.py`;
- `frontend/src/api/cart.ts`, `frontend/src/pages/CartPage.tsx`, `frontend/src/pages/CartPage.dicemagic.test.tsx`;
- `frontend/src/components/DiceMagicCheckout.tsx`, `frontend/src/styles/cart.css`;
- ez a dokumentum és `docs/dicemagic-checkout.md`.
