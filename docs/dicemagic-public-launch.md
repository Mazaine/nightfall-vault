# DiceMagic nyilvános indulás – élesítési ellenőrzőlista

A kód **alapértelmezésben admin-only**. A PR merge és a normál Docker-deploy
**önmagában nem** teszi nyilvánossá a partner termékeit, és nem küld új rendelést.

## Indulás előtt kötelező
1. Partner jóváhagyása a nyilvános megjelenéshez és **valós vásárlói rendelések** fogadásához.
2. A már kipróbált partner API jogosultságának, rendelési visszaigazolásának,
   készletblokkolásának, adatvédelmi tájékoztatójának és tárolási szabályainak felülvizsgálata.
3. PostgreSQL mentés; **0056_dicemagic_lifetime_vip** migráció alkalmazása;
   backend + frontend tesztek, éles környezetben logok és adatbázis migrációs állapot ellenőrzése.
4. Átvizsgálni a dedikált inaktív, bejelentkezésre alkalmatlan
   `dicemagic_shop` fiókot: `vip_lifetime=true`. Más felhasználó nem kap korlátlan VIP-t.
5. Guest / vásárló / admin hirdetésmegjelenítés, 0 készlet,
   kosár, adatátadási beleegyezés és rendelési folyamat ellenőrzése.
   Az adminszintű küldési és rekonsziliációs végpontok admin-only maradnak.

## Kapcsoló (csak jóváhagyás után)

A szerver `.env.production` fájljában:
```dotenv
DICEMAGIC_VISIBILITY=public
```
Ez a nyilvános megjelenítést és az ügyfél által indított bolti checkoutot engedélyezi.
A külső, valódi rendelésküldéshez **továbbra is két független feltétel**
kell: `DICEMAGIC_REAL_ORDER_ENABLED=true` és az adminfelületi
`orders_enabled=true`. Egyiket sem szabad csendben módosítani.

A konfigurációs módosítás után érintett konténerek újralétrehozása,
majd GET `/api/auctions?listing_type=fixed`, GET `/api/shop/dicemagic/status` (auth),
valamint egy előzetesen egyeztetett, valós tesztrendelés ellenőrzése.
A külső rendelésnek idempotens azonosítója van; uncertain állapotban
**soha ne készítsenek új rendelést** ugyanarra a vásárlásra.

## Eladói egyensúly
Az alapértelmezett `balanced` / „Ajánlott · minden eladótól” rendezés
**eladónként egyet mutat körönként**.
A célzott keresési szűrőket nem változtatja meg.
A kifejezetten kiválasztott `newest`, `oldest`, ár-, licit- és lejárat-
rendezések továbbra is a választott szempontot követik.
A főoldal 8 véletlen készletes HKK-lapjánál szintén eladónként váltakozik a válogatás.

## Visszaállítás
A láthatóság visszavonása: `DICEMAGIC_VISIBILITY=admin_only`,
majd az érintett konténerek újralétrehozása. A már elfogadott
rendelések történetét és a készletfoglásokat **nem szabad törölni**;
a folyamatban lévő vásárlók ügyét partnerrel külön kell kezelni.

## DiceMagic-termékek besorolása
A szinkron-API ellenőrzött `type` mezője alapján a `card` termékek
a **Lapok** (single), a `booster` termékek a **Csomagok** (bundle)
fülön jelennek meg. A bontatlan booster, display és hasonló termék egyetlen
eladási egység, az import nem talál ki csomagtartalmat. Ez a már
szinkronizált termékekre is érvényes a következő sikeres szinkronkor.
Amennyiben a partner displayt `card` típussal küld, a felülvizsgálatig
nem következtetünk csak a névből, a típust a partnerrel tisztázni kell.

## Tesztrendelések
Nem admin vásárló sem az admin végpontokon, sem a nyilvános checkout
folyamatban nem adhat le `test_order=true` kérést; a backend 422-t ad.
Az admin megerősített tesztrendelése a partnernél valódi megrendelés,
ezért partneri egyeztetés nélkül nem indítható.

## Admin rendelésfelügyelet és készletblokkok
A publikus vevői rendelések **az admin rendeléslistában is láthatók**
(`buyer_id` mezővel), és az admin képes a vevőtől függetlenül
elvégezni a szabályozott készlet-egyeztetést. A vevő az admin
listákat/egyeztetést nem érheti el, a vevői küldési végpont továbbra
is a saját `buyer_id` alapján engedélyez. A jóváhagyott adatmegőrzési
folyamat is kezeli az összes lezárt vásárlói rendelést.

Az admin rendelésküldés az **eredeti vevő azonosítójával** véglegesíti
a partner felé a vásárló megrendelését. A vevők nem küldhetik el más
felhasználók rendeléseit; az admin külön megerősítése kötelező.

Az adminok **nem** láthatják egymás saját DiceMagic-tesztrendeléseit.
A vásárlói rendelésfelügyelet csak nem admin vásárlókra terjed ki.
Az adatvédelmi előnézet alapértelmezésben továbbra is a kezelő
saját rendeléseit vizsgálja; normál vevőnél külön `buyer_id` paraméterrel
és jóváhagyott adatmegőrzési szabályzattal lehet felülvizsgálatot kérni.
