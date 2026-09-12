# Web Push + VAPID

A rendszer szabványos Web Push protokollt használ VAPID-hitelesítéssel. Nem használ Firebase SDK-t és nem tárol FCM device tokent: a böngésző által adott endpointot, `p256dh` és `auth` kulcsot tárolja felhasználó–eszköz subscriptionként. A notification outbox ugyanabban a tranzakcióban képez külön `push` feladatot minden aktív célsubscriptionhöz.

## Adatfolyam és jogosultság

1. A felhasználó explicit gombnyomással engedélyt ad, majd kategóriánként külön bekapcsolja a „Telefonos push értesítés” csatornát.
2. A frontend az aktív service worker `PushManager` példányával feliratkozik a backendtől lekért publikus VAPID-kulccsal.
3. A hitelesített API eltárolja az endpointot, a `p256dh` és `auth` kulcsot, valamint egy rövid, tisztított user-agent értéket.
4. Egy endpoint globálisan egyedi. Másik fiók explicit bekapcsolásakor atomikusan az aktuális felhasználóhoz kerül. Egy korábban létrejött outbox-feladat küldés előtt újra ellenőrzi a subscription tulajdonosát, ezért fiókváltás után nem kézbesíthet régi tulajdonosnak szánt értesítést.
5. A dispatcher csak teljes Web Push konfiguráció, engedélyezett kategóriapreferencia és aktív subscription mellett hoz létre push-feladatot. Meglévő felhasználóknál a push alapértéke `false`.
6. A worker eszközönként külön feladatot dolgoz fel. Siker esetén frissíti a `last_success_at` értéket; 404/410 esetén soft revoke történik; átmeneti hibánál az outbox meglévő backoffja érvényesül.
7. A service worker szigorúan validált, verziózott payloadból helyi ikonnal jelenít meg értesítést. Kattintáskor csak azonos originű, központilag engedélyezett belső cél nyitható meg.

Az endpoint és a böngészőkulcsok érzékeny technikai adatok: nem kerülnek API-válaszba, naplóba vagy frontend buildváltozóba. A VAPID privát kulcs kizárólag backend-secret. A lezárt képernyőn kategóriánként rögzített, általános magyar szöveg jelenik meg; licitösszeg, partneradat, moderációs részlet és más érzékeny adat nem kerül a payloadba.

## Konfiguráció

```dotenv
WEB_PUSH_ENABLED=false
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:security@example.invalid
WEB_PUSH_SUBSCRIPTION_RATE_LIMIT_PER_MINUTE=10
WEB_PUSH_REQUEST_TIMEOUT_SECONDS=10
WEB_PUSH_ALLOWED_HOST_SUFFIXES=["fcm.googleapis.com","updates.push.services.mozilla.com","notify.windows.com"]
```

Productionben `WEB_PUSH_ENABLED=true` esetén mindkét kulcs, érvényes `mailto:` vagy HTTPS `VAPID_SUBJECT`, nem üres host-allowlist és 1–30 másodperces timeout kötelező. Hiányos konfiguráció leállítja a production validálást. A privát kulcsot secret managerbe vagy szigorú jogosultságú szerveroldali env fájlba kell tenni; Gitbe, frontend `.env`-be, build argumentumba és naplóba nem kerülhet.

VAPID-kulcspár helyi generálása:

```bash
npx web-push generate-vapid-keys --json
```

A publikus kulcs is a backend konfigurációjába kerül; a frontend futásidőben, hitelesített API-n kéri le.

## Endpoint- és hálózatbiztonság

A feliratkozási API és a küldő egyaránt csak HTTPS endpointot fogad el. Tiltott a felhasználónév/jelszó, fragment, nem 443-as port, közvetlen IP, localhost és `.local` név. A hostnak pontosan vagy ponttal határolt suffixként illeszkednie kell a konfigurált szolgáltatói allowlistre.

Küldéskor új DNS-feloldás történik, és minden kapott címnek globálisan routolhatónak kell lennie; private, loopback, link-local, multicast, reserved, unspecified és metadata-cím elutasított. DNS-hiba átmeneti hiba. A küldő nem követ átirányítást, nem használ környezeti proxyt, és rövid timeouttal dolgozik.

Az alap allowlist a vizsgált böngésző-szolgáltatásokat fedi le:

- Chrome/Chromium Android: `fcm.googleapis.com`;
- Firefox Autopush: `updates.push.services.mozilla.com`;
- Microsoft WNS-alapú endpoint: `notify.windows.com` suffix.

Új vagy megváltozott szolgáltatói hostot csak dokumentált böngészőn, valós subscription endpoint alapján szabad felvenni. A DNS-ellenőrzés alkalmazásszinten nem tud tökéletes kapcsolat-szintű DNS-pinninget adni: a `pywebpush`/`requests` a validálás után saját feloldást végezhet. Emiatt a host-allowlist, a tiltott redirect/proxy, a hálózati egress-korlátozás és a push-szolgáltatók felé korlátozott tűzfalszabály együtt ad erősebb védelmet.

## Hibakezelés és kézbesítési garancia

- könyvtár által elfogadott 2xx válasz: `delivered` és `last_success_at` frissítés;
- 404/410: lejárt subscription soft revoke, a feladat befejezett, nincs retry;
- 429, 5xx, timeout, kapcsolat- vagy DNS-hiba: `retry`, bounded exponential backoff;
- hibás payload/subscription vagy más egyértelmű 4xx: tartós `failed`;
- hiányos VAPID-konfiguráció: tartós feladathiba, de nem vonja vissza a subscriptiont.

A kézbesítés at-least-once. Workerösszeomlás esetén provider-elfogadás után ismétlődhet küldés; a stabil `nightfall-notification-{notification_id}` tag miatt ugyanazon eszközön az értesítés lecserélhető ahelyett, hogy új példányként jelenne meg. Ez nem jelent end-to-end exactly-once garanciát.

## SSE és több fül

Aktív helyi Web Push subscription mellett az SSE továbbra is frissíti az in-app listát és toastot, de ugyanahhoz a push-képes notificationhöz nem hív külön `new Notification(...)` rendszerértesítést. Subscription nélkül az SSE-értesítés fallback marad. Több fül között rövid élettartamú, notification ID-alapú localStorage claim akadályozza a fallback többszörözését; subscription-állapotváltozásról local event és `BroadcastChannel` tájékoztatja a füleket.

## Migráció, indítás és visszagörgetés

1. Készíts biztonsági mentést, majd futtasd sorrendben a `0029_web_push_subscriptions` és `0030_web_push_delivery` migrációt.
2. Add meg a VAPID-secretet és a validált beállításokat, majd csak ezután állítsd `WEB_PUSH_ENABLED=true` értékre.
3. Indítsd újra az API-t és a notification workert; ellenőrizd, hogy nincs folyamatos retry.
4. Vészleállításhoz állítsd `WEB_PUSH_ENABLED=false` értékre. Ez megállítja az új push-feladatok képzését; az in-app, realtime és email csatornát nem kapcsolja ki.

Rollback előtt kapcsold ki a Web Push-t és várd meg vagy kezeld a függő push-feladatokat. A `0030` downgrade törli a push outbox-sorokat, majd eltávolítja a hozzáadott oszlopokat és constraintet; ezt csak tudatos adatvesztéssel szabad futtatni. A `0029` downgrade ezután távolítható el.

## Android végponttól végpontig ellenőrzés

1. Productionnel azonos HTTPS staging originen, külön staging VAPID-kulccsal és nem production felhasználókkal tesztelj.
2. Chrome Androidban telepítsd a PWA-t, nyisd meg az értesítési beállításokat, engedélyezd explicit a push-t és egy tesztkategóriát.
3. Ellenőrizd, hogy pontosan egy aktív subscription és subscriptionönként egy push outbox-sor jött létre, titkos kulcs/endpoint naplózása nélkül.
4. Zárd be az alkalmazást és zárd le a képernyőt, majd válts ki teszteseményt. Az Android energiatakarékossága miatt a kézbesítés nem garantált és késhet.
5. Ellenőrizd a generikus lock-screen szöveget, az egy példányban megjelenő értesítést és a megfelelő belső oldalra navigáló kattintást bejelentkezett, illetve a bejelentkezésre irányított állapotban.
6. Ismételd meg nyitott alkalmazással és több füllel: in-app/SSE frissítés maradjon, második rendszerértesítés ne jelenjen meg.
7. Kapcsold ki a push-t, majd ellenőrizd a soft revoke-ot és azt, hogy új push-feladat nem képződik.
