# Nightfall Vault PWA- és TWA-alap

## Elkészült

- A web manifest a Nightfall Vault nevével, színeivel, magyar nyelvvel és standalone megjelenéssel.
- 192×192 és 512×512 normál PNG ikon, valamint egy biztonságos margójú 512×512 maskable ikon.
- Minimális service worker, amely csak az install és activate életciklus-eseményeket kezeli.
- Kizárólag production buildben futó, hibát biztonságosan elnyelő service worker-regisztráció.
- Célzott Nginx MIME- és cache-szabályok a manifesthez, service workerhez és ikonokhoz.

Az ikonok forrása a `frontend/public/assets/nightfall-vault-logo-transparent.png` bal oldalán található eredeti Nightfall Vault embléma. Az embléma arányai változatlanok; a négyzetes ikonok a meglévő `#050509` háttérszínt és megfelelő belső margót használják.

## Szándékosan nincs még fetch- vagy cache-kezelés

A service worker nem figyel `fetch` eseményt, nem használ alkalmazáscache-t, és nem készít offline választ. Így nem tud API-, autentikációs, SSE-, HTML-, privát vagy tranzakciós választ eltárolni, illetve folyamatban lévő licitálást megzavarni.

## Későbbi feladatok

- Web Push/FCM subscription és `push`, illetve `notificationclick` service worker események.
- Backend push-token kezelés és az outbox új kézbesítési csatornája.
- Külön Android TWA wrapper repository.
- Release signing és a Play App Signing SHA-256 fingerprint beszerzése.
- `https://nightfallvault.hu/.well-known/assetlinks.json` publikálása és Digital Asset Links ellenőrzése.

Ebben a szakaszban nincs Firebase SDK, értesítésiengedély-kérés, Android wrapper vagy Digital Asset Links módosítás.

## Kézi ellenőrzési lista

1. Production buildben a `/manifest.webmanifest` 200 választ és manifest JSON MIME-t ad.
2. A `/service-worker.js` 200 választ, JavaScript MIME-t és rövid/no-cache fejlécet ad.
3. Ismeretlen manifest- vagy service-worker-útvonal 404-et ad, nem az SPA HTML-t.
4. A DevTools Application nézetében a manifest mezői és mindhárom ikon hibamentesen betöltődnek.
5. Production környezetben a service worker installált, majd normál böngésző-életciklussal aktiválódik.
6. Fejlesztői és tesztkörnyezetben nincs service worker-regisztráció.
7. Az Application/Cache Storage üres, és hálózati kérést nem szolgál ki service worker cache-ből.
8. Login, licitálás, SSE, aukció- és tranzakciós oldalak működése változatlan.
9. Android Chrome-ban ellenőrizhető a PWA telepíthetősége és az ikonok normál, illetve maskable megjelenése.
