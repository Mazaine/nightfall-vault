# Nightfall Vault - Sprint 5 zarojelentes

Datum: 2026-07-12

## 1. Osszefoglalo

A Sprint 5 celja a production readiness reteg megerositese volt redesign es Docker architektura bontas nelkul. Elkeszult a Notification Center, Watchlist domain, admin aukcio moderacio, soft delete, domain audit log alap, session-expired frontend kezeles es FastAPI lifespan atallas.

Statusz: elkeszult, technikai adossaggal. Nincs ismert Sprint 5 blokkoló.

## 2. Uj modellek es migracio

Uj modell:

- `WatchlistItem`

Bovitesek:

- `Auction`: `deleted_at`, `moderated_at`, `moderated_by_admin_id`, `moderation_reason`, `moderation_previous_status`
- `AuditLog`: `auction_id`
- `Notification`: tipus check constraint

Migracio:

- `backend/alembic/versions/0005_production_readiness.py`
- revision: `0005_production_readiness`

## 3. Notification Center

Uj API-k:

- `GET /api/notifications`
- `GET /api/notifications/unread-count`
- `POST /api/notifications/{notification_id}/read`
- `POST /api/notifications/mark-all-read`

Tipusok:

- `outbid`
- `auction_won`
- `auction_lost`
- `auction_sold`
- `auction_unsold`

Frontend:

- header olvasatlan badge
- `NotificationsPage`
- mark read es mark all read

## 4. Watchlist domain

Uj API-k:

- `GET /api/watchlist`
- `POST /api/watchlist/{auction_id}`
- `DELETE /api/watchlist/{auction_id}`

Frontend:

- `WatchlistPage`
- aukcio reszlet oldali "Figyelem" gomb
- header figyelolista link

## 5. Admin moderacio

Uj admin API-k:

- `GET /api/admin/auctions`
- `POST /api/admin/auctions/{auction_id}/suspend`
- `POST /api/admin/auctions/{auction_id}/restore`
- `DELETE /api/admin/auctions/{auction_id}`

Soft delete utan az aukcio normal publikus es felhasznaloi API-ban nem latszik. Admin listaban moderacios celbol tovabbra is elerheto.

## 6. AuditLog

Domain audit esemenyek:

- `auction_created`
- `auction_activated`
- `auction_bid`
- `auction_buy_now`
- `auction_status_changed`
- `auction_moderated_suspend`
- `auction_moderated_restore`
- `auction_moderated_delete`

Nincs publikus audit irasi API.

## 7. Auth es lifespan

A frontend API kliens 401 valasznal `nightfall-session-expired` esemenyt kuld. Az AuthProvider torli a local sessiont es session lejart uzenetet jelenit meg.

A FastAPI scheduler inditasa `on_event` helyett lifespan handlerben tortenik. A korabbi `on_event` deprecation warning a Sprint 5 ellenorzesben mar nem jelent meg.

## 8. Tesztek

Uj tesztfajl:

- `backend/tests/test_production_readiness.py`

Lefedett esetek:

- Notification API
- unread counter
- mark as read
- mark all read
- notification IDOR
- Watchlist CRUD
- watchlist privat aukcio IDOR
- admin moderacio
- soft delete
- AuditLog
- lifespan startup
- scheduler regresszio

Teljes backend eredmeny:

- parancs: `docker compose exec -T backend pytest`
- eredmeny: `41 passed, 195 warnings in 27.00s`

## 9. Frontend build

Parancs:

```powershell
docker compose exec -T frontend npm run build
```

Eredmeny:

- sikeres
- 75 modul transformalva
- build ido: 3.72s

## 10. Migracio es Docker

Futtatott parancsok:

```powershell
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic current
```

Eredmeny:

- upgrade sikeres
- current revision: `0005_production_readiness (head)`

Docker Compose a Sprint 5 folytatasakor ujrainditva lett `docker compose up -d` paranccsal.

## 11. Git commitok

Implementacio:

- `b160546` - `feat(auction): add production readiness workflows`

Dokumentacio:

- `docs: add sprint 5 report and production readiness notes`

Push nem tortent.

## 12. Technikai adossag

- Scheduler tovabbra is in-process, tobb replika eseten kulon worker vagy leader election kell.
- Notification Center email/push csatornat nem tartalmaz.
- Admin audit olvaso felulet meg nincs.
- Magyar frontend szovegek egy resze korabbi kodolas miatt tovabbi tisztitast igenyel.
- Product domain tovabbra is legacy.

## 13. Sprint 6 javaslat

Sprint 6 javasolt celja az eles uzemeltetes elokeszitese: monitoring, dependency audit, backup restore proba, kep storage/optimalizalas, email/push ertesitesi csatornak, audit log admin felulet es scheduler production worker strategia.
