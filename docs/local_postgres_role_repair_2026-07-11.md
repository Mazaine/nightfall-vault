# Nightfall Vault - local PostgreSQL role repair

Dátum: 2026-07-11

## Hiba

A lokális Docker PostgreSQL konténer ismétlődő hibát írt:

```text
FATAL: role "nightfall_vault_dev" does not exist
```

A javítás közben kiderült, hogy a meglévő PostgreSQL data volume korábban más adatbázis-szereppel inicializálódott. Emiatt a konténer aktuális `POSTGRES_USER=nightfall_vault_dev` környezeti változója nem hozta létre automatikusan a role-t, mert a volume már létezett.

## Javítás

Nem történt volume törlés és nem történt secret kiírás.

Biztonságosan, lokális maintenance módban létrejött:

- `nightfall_vault_dev` PostgreSQL role
- `nightfall_vault_dev` PostgreSQL adatbázis

A role és az adatbázis kizárólag lokális fejlesztői környezethez készült.

## Ellenőrzés

Közvetlen adatbázis-kapcsolat:

```text
current_user: nightfall_vault_dev
current_database: nightfall_vault_dev
```

Backend health:

```text
status: ok
service: Nightfall Vault API
```

Backend tesztek:

```text
docker compose exec -T backend pytest: 8 passed
```

Frontend build:

```text
npm run build: sikeres
```

Docker állapot:

```text
postgres: healthy
redis: healthy
backend: running
frontend: running
```

## Biztonsági megjegyzés

Jelszó, token vagy egyéb secret nem került dokumentációba, parancskimenetbe vagy Gitbe.
