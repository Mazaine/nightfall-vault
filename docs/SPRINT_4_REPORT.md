# Nightfall Vault - Sprint 4 zarojelentes

Datum: 2026-07-12

## 1. Osszefoglalo

A Sprint 4 celja a licitalasi elmeny es az aukcio-eletciklus operacios megerositese volt. A sprint vegere elkeszult a teljesebb Buy Now zarasi folyamat, a lejart aktiv aukciokat kezelo scheduler, az SSE alapu valos ideju aukciofrissites, az outbid ertesitesi alap, a "Licitjeim" backend API es a frontend session allapot kozpontositasanak elso lepese.

Statusz: elkeszult, technikai adossaggal. Nincs ismert Sprint 4 blokkoló; a fennmarado pontok production-kemenyiteshez es Sprint 5 funkciokhoz tartoznak.

## 2. Uj modellek

Uj modell:

- `Notification`

Minimum mezok:

- `id`
- `user_id`
- `auction_id`
- `type`
- `title`
- `message`
- `is_read`
- `read_at`
- `created_at`

Az ertesites jelenleg backend rekord es API alapu. Email, push vagy teljes frontend notification center nem keszult ebben a sprintben.

## 3. Uj API-k

Uj vagy kibovitett vegpontok:

- `GET /api/auctions/my-bids` - a bejelentkezett felhasznalo licitalt aukcioi
- `GET /api/auctions/notifications` - a bejelentkezett felhasznalo ertesitesei
- `GET /api/auctions/{auction_id}/stream` - SSE alapu aukcio snapshot stream
- `POST /api/auctions/{auction_id}/bids` - Buy Now es outbid notification logikaval bovult

Az `auction_id/stream` endpoint `auction_update` esemenyt kuld. A tesztekhez egy `once=true` diagnosztikai mod is elerheto, amely egy snapshot utan zarja a streamet.

## 4. Buy Now workflow

A villamarat elero licit most mar nem csak jelzest ad, hanem lezaro muveletet vegez:

- letrejon a licit,
- frissul az aktualis ar,
- az aukcio `sold` allapotba kerul,
- a `winner_id` a licitalo felhasznalora all,
- a `finalized_at` rogzul,
- tovabbi licit `409` hibaval elutasitott.

Konkurens Buy Now kiserletnel az aukcio row lock vedelme miatt egy sikeres zaras maradhat.

## 5. Scheduler

Uj service:

- `backend/app/services/auction_scheduler.py`

Mukodes:

- in-process FastAPI hatterfeladatkent indul local/dev kornyezetben;
- lejart, `active` statuszu aukciokat keres;
- row lockot hasznal `SKIP LOCKED` opcioval;
- licittel rendelkezo aukciot `sold` statuszra zar;
- licit nelkuli aukciot `unsold` statuszra zar;
- idempotens: mar lezart aukciot nem dolgoz fel ujra.

Technikai adossag: production tobb replika eseten kulon worker vagy leader election javasolt.

## 6. Realtime licitelmeny

Az aukcio reszletoldal SSE streamen frissul. A snapshot tartalma:

- auction ID
- statusz
- aktualis ar
- highest bid ID
- licitszam
- winner ID
- lejarati ido
- licittortenet

A frontend EventSource kapcsolatot nyit, `auction_update` esemenyre frissiti az aukcio statuszat, aktualis arat, nyertest, lejarati idot es a licittortenetet.

## 7. Outbid ertesitesek

Ha egy uj licit mas felhasznalot letaszit a highest bidder poziciobol, backend oldalon `outbid` tipusu `Notification` rekord jon letre a korabbi highest biddernek.

Az ertesites nem frontend altal kuldott user ID-ra epul, hanem a tranzakcio elotti aukcio/highest bid allapotbol szarmazik.

## 8. Licitjeim API es frontend

A "Licitjeim" oldal a `GET /api/auctions/my-bids` endpointbol kapja a felhasznalo licitalt aukcioit.

Megjelenitett allapotok:

- megnyert aukcio
- a felhasznalo vezet
- rad licitaltak
- figyeles alatt

A sajat aukcio letrehozas utan a lista frissul.

## 9. Frontend session kezeles

Uj frontend komponens:

- `frontend/src/AuthContext.tsx`

A token es user localStorage kezelese egy helyre kerult. A navbar es protected route logika az AuthProvider allapotot hasznalja. A login API mar a valaszt adja vissza, nem ir kozvetlenul localStorage-ba.

Tovabbi teendo: token lejart UX, refresh strategia es teljes API kliens interceptor.

## 10. Biztonsagi audit

Ellenorzott vedelmek:

- Buy Now tranzakcion beluli zaras
- double Buy Now vedett row lockinggal
- outbid notification backend oldali szarmaztatas
- "Licitjeim" current userbol szarmaztatott scope
- SSE visibility check az aukcio lathatosagi szabalyai szerint
- current price es winner tovabbra sem frontendrol jon
- chat es ertekeles XSS vedelme valtozatlan: React escaping, nincs `dangerouslySetInnerHTML`

Megjegyzes: az SSE publikus lathato aukcioknal publikus olvasasi csatorna. Privat, draft vagy jogosulatlan aukcioknal a backend lathatosagi szabalyai ervenyesulnek.

## 11. Tesztek

Uj Sprint 4 lefedes a `backend/tests/test_bid_domain.py` fajlban:

- Buy Now lezárja az aukciót es engedelyezi a nyertes funkciokat
- dupla Buy Now tranzakciobiztonsag
- scheduler `sold` zaras licittel
- scheduler `unsold` zaras licit nelkul
- otperces hosszabbitas megakadalyozza az azonnali scheduler zarast
- outbid notification es "Licitjeim" endpoint
- realtime stream aukcio snapshot

Futtatott teljes backend parancs:

```powershell
docker compose exec -T backend pytest
```

Eredmeny:

- 36 teszt osszesen
- 36 sikeres
- 0 sikertelen
- 0 kihagyott
- 166 warning
- futasi ido: 19.76s

Ismert warningok:

- FastAPI `on_event` deprecation
- passlib `crypt` deprecation
- Pydantic Field extra deprecation legacy schema fajlban
- jose `datetime.utcnow` deprecation

## 12. Frontend build

Futtatott parancs:

```powershell
docker compose exec -T frontend npm run build
```

Eredmeny: sikeres.

Build output:

- `tsc && vite build`
- 73 modul transformalva
- production bundle elkeszult
- build ido: 2.38s

## 13. Migracio

Uj migracio:

- `backend/alembic/versions/0004_notifications_and_realtime.py`

Revision:

- `0004_notifications_and_realtime`

Futtatott parancs:

```powershell
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic current
```

Eredmeny:

- upgrade sikeres
- current revision: `0004_notifications_and_realtime (head)`

Kulon ures adatbazisos migracios proba nem futott.

## 14. Docker allapot

Futtatott parancs:

```powershell
docker compose ps
```

Eddigi ellenorzott allapot:

- postgres running/healthy
- redis running/healthy
- backend running
- frontend running
- compose successful

## 15. Git commitok

Sprint 4 implementacios commit:

- `5cbd82b` - `feat(auction): add realtime bidding workflow`

Dokumentacios zaro commit:

- `docs: add sprint 4 report and operations updates`

Push nem tortent.

## 16. Technikai adossag

- Scheduler in-process fut; production multi-replika kornyezethez kulon worker vagy leader election kell.
- FastAPI startup/shutdown `on_event` deprecation warningot ad.
- SSE stream alap realtime frissitest ad, de nincs teljes WebSocket presence vagy advanced reconnect strategy.
- Outbid ertesites API alapu; nincs email/push csatorna es nincs teljes frontend notification center.
- AuthProvider elso lepes kesz, de token refresh es session expiry UX tovabbi fejlesztes.
- Product domain tovabbra is legacy elem.

## 17. Sprint 5 javaslat

Sprint 5 javasolt celja a production-minosegu felhasznaloi elmeny es uzemeltetesi kemenyites: teljes ertesitesi kozpont, admin aukcio moderacio, token lejart/session UX, mobil finomitasok es scheduler/worker architektura tisztazasa.

Emellett erdemes elkezdeni az audit logok es monitoring alapok bevezeteset, mert a licit, Buy Now es zarasi folyamatok uzleti szempontbol kritikusak.
