# 🧩 Nightfall Vault – ER diagram

## Cél

Ez a dokumentum a Nightfall Vault fő adatbázis-entitásait és kapcsolatait mutatja be.

Ez még tervezési szint, nem végleges adatbázis-séma.

---

# ER diagram

```mermaid
erDiagram
    USERS ||--o{ AUCTIONS : creates
    USERS ||--o{ BIDS : places
    USERS ||--o{ FAVORITES : saves
    USERS ||--o{ WATCHLISTS : watches
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ REPORTS : submits
    USERS ||--o{ ADMIN_LOGS : performs

    AUCTIONS ||--o{ BIDS : has
    AUCTIONS ||--o{ AUCTION_IMAGES : contains
    AUCTIONS ||--o{ FAVORITES : saved_in
    AUCTIONS ||--o{ WATCHLISTS : watched_in
    AUCTIONS ||--o{ REPORTS : reported_in
    AUCTIONS }o--|| CATEGORIES : belongs_to

    USERS {
        uuid id
        string username
        string email
        string password_hash
        string role
        string status
        string language
        datetime created_at
        datetime updated_at
    }

    AUCTIONS {
        uuid id
        uuid owner_id
        uuid category_id
        string title
        text description
        decimal starting_price
        decimal current_price
        decimal bid_step
        decimal buy_now_price
        datetime starts_at
        datetime ends_at
        string status
        datetime created_at
        datetime updated_at
    }

    BIDS {
        uuid id
        uuid auction_id
        uuid user_id
        decimal amount
        datetime created_at
    }

    CATEGORIES {
        uuid id
        uuid parent_id
        string name
        string slug
        datetime created_at
        datetime updated_at
    }

    AUCTION_IMAGES {
        uuid id
        uuid auction_id
        string filename
        string path
        int sort_order
        boolean is_cover
        datetime created_at
    }

    FAVORITES {
        uuid id
        uuid user_id
        uuid auction_id
        datetime created_at
    }

    WATCHLISTS {
        uuid id
        uuid user_id
        uuid auction_id
        datetime created_at
    }

    NOTIFICATIONS {
        uuid id
        uuid user_id
        string type
        string title
        text message
        boolean is_read
        datetime created_at
    }

    REPORTS {
        uuid id
        uuid user_id
        uuid auction_id
        string reason
        text description
        string status
        datetime created_at
    }

    ADMIN_LOGS {
        uuid id
        uuid user_id
        string action
        string entity_type
        uuid entity_id
        datetime created_at
    }
```

---

# Fő kapcsolatok

## Felhasználó és aukció

Egy felhasználó több aukciót is létrehozhat.

```text
USERS 1 ─── N AUCTIONS
```

---

## Aukció és licitek

Egy aukcióhoz több licit tartozhat.

```text
AUCTIONS 1 ─── N BIDS
```

---

## Felhasználó és licitek

Egy felhasználó több licitet is leadhat.

```text
USERS 1 ─── N BIDS
```

---

## Aukció és képek

Egy aukcióhoz több kép is tartozhat.

```text
AUCTIONS 1 ─── N AUCTION_IMAGES
```

---

## Felhasználó és kedvencek

Egy felhasználó több aukciót is elmenthet kedvencnek.

```text
USERS 1 ─── N FAVORITES
AUCTIONS 1 ─── N FAVORITES
```

---

## Felhasználó és figyelőlista

Egy felhasználó több aukciót is figyelhet.

```text
USERS 1 ─── N WATCHLISTS
AUCTIONS 1 ─── N WATCHLISTS
```

---

# Megjegyzések

A `FAVORITES` és `WATCHLISTS` külön táblában maradnak, mert később eltérő logikát kaphatnak.

Például:

* kedvenc: egyszerű mentés
* figyelőlista: értesítések, licitfigyelés, aukciózárás előtti jelzés

---

# Későbbi bővítések

A későbbi sprintekben új táblák kerülhetnek be:

* payments
* vip_memberships
* tokens
* invoices
* messages
* reviews
* auction_events
* system_settings

---

# Fontos szabály

Ez a diagram Sprint 0-s tervezési állapotot mutat.

A tényleges implementáció előtt minden táblát külön validálunk:

* szükséges-e már az MVP-hez,
* milyen mezők kellenek,
* milyen indexek szükségesek,
* milyen biztonsági szabályok vonatkoznak rá.
