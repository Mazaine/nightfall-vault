# Nightfall Vault - Biztonsag es uzemeltetes

Utolso frissites: 2026-07-12

## Secret kezeles

A repository nem tartalmazhat valodi jelszot, API kulcsot vagy eles secretet.

Engedelyezett:

- `.env.example`
- `backend/.env.example`
- `frontend/.env.example`

Tiltott:

- `.env`
- `.env.*` a peldafajlok kivetelevel
- privat kulcsok
- tanusitvanyok
- backup fajlok, amelyek secretet tartalmazhatnak

A `.gitignore` tartalmazza az erzekeny fajlok mintait.

## Local/dev admin

Local admin letrehozasa csak kornyezeti valtozokbol tortenhet.

Kotelezo valtozok:

- `DEV_ADMIN_EMAIL`
- `DEV_ADMIN_PASSWORD`

Opcionals valtozok:

- `DEV_ADMIN_USERNAME`
- `DEV_ADMIN_FULL_NAME`

A seed script production kornyezetben megtagadja a futast, es nem tartalmaz alapertelmezett jelszot. A script kimenete nem ir ki jelszot.

Futtatas local/dev kornyezetben:

```powershell
docker compose exec -T backend python -m app.scripts.seed_dev_admin
```

## Secret generalas

Fejlesztoi secret generalasa:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

PostgreSQL jelszo generalasa:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Local adatbazis javitas

2026-07-11-en a local PostgreSQL peldanyban hianyzott a `nightfall_vault_dev` role es adatbazis. A local/dev kornyezetben a role es adatbazis helyre lett allitva, majd Alembic migracio futott.

Ellenorzott allapot:

- PostgreSQL kapcsolat rendben
- Redis `PONG`
- Alembic revision: `0004_notifications_and_realtime (head)`
- `users` tabla letrejott

## Docker Compose

Aktiv szolgaltatasok:

- `postgres`
- `redis`
- `backend`
- `frontend`

Health ellenorzesek:

```powershell
docker compose ps
docker compose exec -T redis redis-cli ping
docker compose exec -T backend alembic current
```

## Repository audit eredmeny

2026-07-11-en ellenorizve:

- `.env` nincs verziozva
- csak `.env.example` fajlok szerepelnek a gitben
- ismert korabbi fejlesztoi jelszomintak nem jelentek meg a git history keresesi eredmenyeiben
- a secret scan csak peldaszovegeket talalt `.env.example` fajlokban

## Manualis teendok

- Eles kornyezethez kulon secret keszlet kell.
- Eles admin felhasznalot ne seed script hozzon letre.
- Deploy elott kulon secret scan es dependency audit javasolt.

## Production Checklist

Elesites elott az alabbi pontokat kotelezo ellenorizni:

- Production secret keszlet letrehozasa es kulonvalasztasa a local/dev ertekektol.
- HTTPS es biztonsagos cookie/CORS konfiguracio ellenorzese.
- PostgreSQL backup strategia es visszaallitasi proba.
- Redis konfiguracio es adatvesztesi kockazat dokumentalasa.
- Dependency audit frontend es backend oldalon.
- Teljes repository secret scan.
- Turnstile production site key es secret beallitasa.
- SMTP/Brevo production kulcsok es sender domainek ellenorzese.
- Monitoring es error logging bekotese.
- Rate limiting eles kornyezetre szabasa.
- Admin letrehozasi folyamat ellenorzese seed jelszo nelkul.

## Incident Recovery

Adatbazis serules eseten az alkalmazast irasi muveletekre le kell allitani, a legutolso ismert jo PostgreSQL backupot kell visszaallitani, majd Alembic revision es adatkonzisztencia ellenorzest kell futtatni. Visszaallitas utan a felhasznaloi aukciok, licitek es admin jogosultsagok mintavetelezett ellenorzese szukseges.

Redis leallas eseten a backendnek degradalt modban kell kezelnie a rate limiting es ideiglenes cache funkciokat. Elso lepes a Redis kontener/szolgaltatas ujrainditasa, majd a backend logok ellenorzese. Ha Redis tartosabban nem elerheto, a rate limiting backend konfiguraciot es a kapcsolodo kockazatot kulon kell kezelni.

Backend indulasi hiba eseten a Docker logokat, kornyezeti valtozokat, adatbazis kapcsolatot es Alembic allapotot kell ellenorizni. Tipikus helyreallitasi sorrend: `.env` validalas, PostgreSQL/Redis health, `alembic current`, majd backend ujrainditas.

Frontend build hiba eseten a TypeScript hibakat, Vite build kimenetet es dependency valtozasokat kell ellenorizni. A javitas utan production buildet kell futtatni, es csak sikeres build utan szabad deployt kesziteni.

## Auction Security

Az Auction domain minden kritikus azonositot backend oldalon szarmaztat vagy ellenoriz.

Vedett manipulacios pontok:

- seller spoofing: `seller_id` az aktualis hitelesitett userbol jon
- winner spoofing: `winner_id` csak admin finalize folyamatban allithato
- sender spoofing: chat `sender_id` az aktualis userbol jon
- reviewer spoofing: ertekeles `reviewer_id` az aktualis userbol jon
- reviewed user manipulacio: a masik fel backend oldalon szarmaztatott
- IDOR: sajat aukcio modositasahoz ownership vagy admin jog kell

Draft aukcio idegen felhasznalonak nem szivarog ki: jogosulatlan lekeresnel `404` valasz jar.

## Bid Security

A Bid domain kritikus azonositokat backend oldalon szarmaztat vagy ellenoriz.

Vedett manipulacios pontok:

- bidder spoofing: `bidder_id` az aktualis hitelesitett userbol jon
- seller spoofing: sajat aukciora licit backend oldalon tiltott
- winner spoofing: lejart aukcio nyertese a legmagasabb licitbol szarmazik
- IDOR: nem publikus aukcio licittortenete nem kerdezheto le jogosulatlanul
- armanipulacio: `current_price` es `highest_bid_id` nem frontendrol jon
- float penzkezeles tiltasa: licitosszegek `Numeric` / `Decimal` alapuak

A licit elhelyezese adatbazis tranzakcioban fut. A backend az aukcio sort row lockinggal zarolja, majd ugyanabban a tranzakcioban ellenorzi a minimum licitet es frissiti az aktualis arat, valamint a legmagasabb licit hivatkozasat.

Konkurens licitek eseten a masodik tranzakcio a frissitett `current_price` alapjan validal, igy nem alakulhat ki elveszett vagy felulirt highest bid allapot.

Az otperces hosszabbitas service-szinten mukodik: ha aktiv aukcion, a zaras elotti utolso ot percben erkezik licit, az `ends_at` meghosszabbodik. A lejart aktiv aukciok zarasat Sprint 4-tol in-process scheduler vegzi.

## Sprint 4 realtime es Buy Now biztonsag

Vedett pontok:

- Buy Now: a villamarat elero licit ugyanabban a tranzakcioban `sold` statuszra zarja az aukciot.
- Double Buy Now: konkurens villamaras licitnel az aukcio row lock miatt csak egy sikeres lezaro licit maradhat.
- Scheduler: lejart aktiv aukciokat `SELECT ... FOR UPDATE SKIP LOCKED` logikaval dolgoz fel.
- Outbid notification: ertesites csak backend oldalon, a korabbi highest bidder alapjan jon letre.
- Licitjeim API: a felhasznalo azonositasa auth tokenbol tortenik, idegen user ID nem kuldheto.
- SSE stream: a stream elott ugyanaz a lathatosagi ellenorzes fut, mint az aukcio reszletnel.

Az SSE stream publikus aukciokhoz publikus olvasasi csatorna. Privat/draft aukcioknal tovabbra is a backend visibility szabalyai ervenyesek. EventSource kliens miatt Authorization headeres privat stream nincs bevezetve.

## Scheduler uzemeltetesi megjegyzes

Local/dev kornyezetben a scheduler a FastAPI alkalmazason beluli hatterfeladat. Production kornyezetben egyetlen backend replika mellett hasznalhato, de tobb replika eseten kulon worker, leader election vagy dedikalt job runner javasolt. A row lock csokkenti a duplikalt feldolgozas kockazatat, de nem helyettesiti a teljes production job orchestrationt.

## Sprint 5 production hardening

Ellenorzott vedelmek:

- Notification IDOR: sajat ertesites listazas/olvasas, idegen notification `404`.
- Watchlist IDOR: privat/draft aukcio idegen felhasznalonak nem adhato figyelolistara.
- Moderacio jogosultsag: suspend, restore es soft delete csak admin dependency mogott erheto el.
- AuditLog manipulacio: domain audit backend service-bol jon letre, nincs publikus irasi API.
- Session spoofing: backend tovabbra is JWT-bol szarmaztatja az aktualis usert.
- Soft delete: torolt aukcio normal publikus es sajat API-ban nem jelenik meg.
- Lifespan: a scheduler startup/shutdown FastAPI lifespan handlerben fut, `on_event` warning megszunt.

Production kockazat: az in-process scheduler tovabbra is csak local/dev es single-instance production setupban idealis. Tobbreplikas deployhoz kulon worker vagy leader election kell.

## Aukciokep biztonsag

Tamogatott MIME tipusok:

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`

Fajlmeret-korlat:

- 5 MB / kep

A backend ellenorzi:

- deklaralt MIME-type
- magic byte alapjan detektalt fajltartalom
- maximum 5 kep / aukcio
- ownership feltoltes elott
- aukcio statusz modositasi jogosultsag
- boritokep integritas

A storage kulcs biztonsagosan generalt, az eredeti fajlnev nem hasznalhato tarolasi kulcskent.

Szukseges local storage konfiguracio:

- `uploads/auctions` konyvtar irhato legyen a backend kontenerben
- `uploads` statikus mount elerheto legyen a FastAPI alkalmazasbol

## Chat jogosultsag

Az aukciohoz kotott chat nem altalanos privat uzenetkuldo rendszer. Csak sikeresen lezart, `sold` statuszu, nyertessel rendelkezo aukcional erheto el.

Hozzaferhet:

- elado
- nyertes

Tiltott:

- draft, scheduled, active, ended, unsold, cancelled vagy suspended aukcio
- nyertes nelkuli aukcio
- idegen felhasznalo
- frontend altal kuldott sender ID

## Ertekeles jogosultsag

Ertekeles csak sikeresen lezart aukcio utan hozhato letre. Az elado csak a nyertest, a nyertes csak az eladot ertekelheti. Onertekeles, nem resztvevo ertekelese es ugyanazon paros duplikalt ertekelese tiltott.

Adatbazis vedelmek:

- rating check constraint: 1-5
- reviewer es reviewed user nem lehet azonos
- unique constraint aukcion beluli reviewer/reviewed parra

## XSS kezeles

Chat uzenetek es ertekeles kommentek sima szovegkent tarolodnak es frontend oldalon React escapinggel jelennek meg. HTML rendereles vagy nyers `dangerouslySetInnerHTML` nem hasznalhato ezekhez a mezokhoz.

## Statusz es idozona

A statuszvaltas kozponti backend service-en keresztul tortenik. Az idopontok idozonatudatosak, a backend UTC-re normalizal. Az idempotens statuszfrissites lista-, reszlet-, statusz-, aktivalasi es finalize muveleteknel fut.

## Moderacios szempontok

Admin moderaciohoz a backend admin jogosultsagi dependency szukseges. Adminisztrativ folyamatban lehet majd felfuggeszteni aukciot, illetve lezart aukciot veglegesiteni. A teljes admin moderacios UI Sprint 2-ben meg nem teljes.
