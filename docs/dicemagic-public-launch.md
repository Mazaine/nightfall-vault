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
