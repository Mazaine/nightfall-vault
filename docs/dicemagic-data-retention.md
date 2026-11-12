# DiceMagic rendelésközvetítési adatok megőrzése

Verzió: 2026-11-11. Hatókör: az admin-only DiceMagic-integráció bolti rendelési payloadja.
A tulajdonos által kért általános működési időtartam helyett alkalmazott konkrét
Nightfall-beállítás: **90 nap**. Ez belső működési döntés, nem általános törvényi határidő.

## Cél és adatkör

A név, e-mail, telefon, szállítási/számlázási cím és megjegyzés a rendelés
DiceMagicnek történő továbbítását és egyeztetését szolgálja. A fizetést, számlázást
és szállítást a DiceMagic kezeli. A Nightfall-payload törlése nem törli a bolt saját
nyilvántartását vagy számláját; azok megőrzéséről nem ez a rendszer dönt.

## Az időszak kezdete

A 90 nap a következők közül a legkésőbbitől számítandó:

- a rendelés utolsó állapotmódosítása;
- az utolsó készletfoglalás igazolt egyeztetése;
- elfogadott rendelésnél az ügylet teljesítési ideje, utolsó módosítása és értékelési/felülvizsgálati határideje.

Nyitott, küldés alatt álló, bizonytalan, teljesítetlen vagy készlet szempontjából
nem egyeztetett rendelés nem kerülhet a törölhető előnézetbe. Az elfogadás önmagában
nem bizonyít fizetést, átvételt vagy teljesítést.

## Végrehajtás és kivételek

A határidő lejárta után az admin az integrációs felület megőrzési paneljén
előnézetet készít. A véglegesítéshez külön meg kell erősítenie, hogy nincs nyitott
jogvita vagy külön megőrzési kötelezettség. Ilyen esetben a műveletet nem végzi el,
és az okot korlátozott hozzáférésű ügykezelésben dokumentálja, a szükségességet
időszakosan felülvizsgálva. Nincs automatikus törlési scheduler.

A művelet az előnézet HMAC-tokenjéhez és az aktuális zárolt rekordhoz kötött.
Megváltozott vagy másik résztvevőhöz tartozó előnézet elutasított. Egy batch legfeljebb
100 saját rendelést érint; nincs részleges törlés. A naplóban csak a rendelésazonosító,
az admin és a megőrzési idő szerepel, a törölt személyes adatok nem.

Megmaradnak a rendelés- és idempotencia-azonosítók, a tételek, árak, mennyiségek,
állapotok és ügyletkapcsolatok. A vásárlóazonosító, a chat és a többi pénzügyi/ügyleti
adat nem válik automatikusan névtelenné. Ez **adatminimalizálás**, nem az összes
kapcsolódó személyes adat visszafordíthatatlan anonimizálása vagy teljes fióktörlés.
A fióktörlési/érintetti kérelmet külön kell kezelni; szükséges ügyleti megőrzést
nem szabad vakon felülírni. A mentések hozzáférése korlátozott, lejáratuk a külön
backup-szabály szerint történik; visszaállítás után a törlési auditot egyeztetni kell.

## Konfiguráció és tájékoztatás

Lokálisan: `DICEMAGIC_ORDER_RETENTION_DAYS=90`,
`DICEMAGIC_RETENTION_POLICY_APPROVED=true`. Ez csak a kézi adminműveletet teszi lehetővé;
ebben a fejlesztési körben a meglévő helyi rendeléseken nem hajtottunk végre törlést.
Új telepítésnél alapértelmezetten nincs jóváhagyott időtartam, a művelet tiltott.

A bolt személyesadat-átadása az adatlap külön hozzájárulásához kötött. Az általános
nyilvános vásárlás megnyitása előtt a teljes adatkezelési tájékoztatóban a felelős
adatkezelőt, kapcsolattartást, jogalapot, érintetti jogokat és a többi adatkör saját
megőrzési rendjét is véglegesíteni kell. Ez a lap nem tanúsít teljes jogi megfelelőséget.

Forrás az időtartam célhoz kötött meghatározásának elvéhez:
[Európai Bizottság – adatkezelési alapelvek](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en).
Az idézett elv nem ír elő 90 napos általános határidőt.
