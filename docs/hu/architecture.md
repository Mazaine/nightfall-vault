# 🏛️ Nightfall Vault – Architektúra

## Projekt filozófiája

A Nightfall Vault célja nem csupán egy aukciós oldal elkészítése.

A projekt egyszerre szolgál:

* tanulási projektként,
* szakmai referenciaprojektként,
* valós felhasználásra alkalmas webalkalmazásként.

A fejlesztés során az alábbi alapelveket követjük:

* Docker-first fejlesztés
* Tiszta architektúra
* Jól dokumentált kód
* Kis, önálló sprintek
* Újrafelhasználható komponensek
* Biztonságközpontú szemlélet
* Magyar és angol nyelvi támogatás

---

# Rendszer architektúra

```text
                 Internet
                     │
          ┌─────────────────────┐
          │      Frontend       │
          │ React + TypeScript  │
          └─────────┬───────────┘
                    │ REST API
          ┌─────────▼───────────┐
          │      FastAPI        │
          └─────────┬───────────┘
                    │
          ┌─────────▼───────────┐
          │    PostgreSQL       │
          └─────────────────────┘
```

A jövőben bővíthető:

* Redis
* WebSocket
* Objektumtár képekhez
* CDN
* Monitoring

---

# Frontend struktúra

```text
frontend/
│
├── assets/
├── components/
│
├── features/
│   ├── auth/
│   ├── auction/
│   ├── profile/
│   ├── admin/
│   └── common/
│
├── hooks/
├── layouts/
├── pages/
├── router/
├── services/
├── store/
├── styles/
├── translations/
├── types/
├── utils/
│
└── App.tsx
```

## Miért feature alapú?

* könnyebb karbantartás
* egyszerűbb bővíthetőség
* logikusan elkülönülő modulok
* nagy projektnél is átlátható marad

---

# Backend struktúra

```text
backend/
│
├── app/
├── api/
├── core/
├── db/
├── models/
├── schemas/
├── services/
├── repositories/
├── security/
├── utils/
├── workers/
│
└── main.py
```

A backend célja, hogy minden rétegnek egyetlen jól meghatározott feladata legyen.

---

# Dokumentáció

```text
docs/
│
├── hu/
│   ├── architecture.md
│   ├── roadmap.md
│   ├── api.md
│   ├── database.md
│   ├── deployment.md
│   ├── setup.md
│   └── style-guide.md
│
└── en/
    ├── architecture.md
    ├── roadmap.md
    ├── api.md
    ├── database.md
    ├── deployment.md
    ├── setup.md
    └── style-guide.md
```

---

# UI Design System

Külön dokumentáció készül a megjelenéshez.

Tartalma:

* Színpaletta
* Tipográfia
* Gombok
* Űrlapok
* Kártyák
* Táblázatok
* Modális ablakok
* Ikonhasználat
* Animációk
* Reszponzív töréspontok

---

# Ajánlott ikonok

* Lucide Icons
* Heroicons

---

# Betűtípusok

Címsorok:

* Cinzel

Normál szöveg:

* Inter

Ez a kombináció jól illeszkedik a dark fantasy hangulathoz, miközben kiválóan olvasható marad.

---

# Kódolási szabályok

## Elnevezések

* Változók: camelCase
* Függvények: camelCase
* React komponensek: PascalCase
* TypeScript interfészek: PascalCase
* Mappák: kebab-case vagy feature-alapú
* Fájlnevek: következetes elnevezés

## Formázás

* ESLint
* Prettier
* Egységes import sorrend
* Következetes mappastruktúra

---

# Git szabályok

## Branch elnevezések

```text
feature/auth-login
feature/bidding
feature/profile

bugfix/navbar
bugfix/image-upload

hotfix/security
```

## Commit üzenetek

```text
feat:
fix:
docs:
style:
refactor:
test:
build:
ci:
```

Példa:

```text
feat: add auction details page

fix: resolve login validation issue

docs: update roadmap

refactor: split auction service

test: add authentication tests
```

---

# Fejlesztési alapelv

Ha egy fájl meghaladja a körülbelül **300–500 sort**, mindig vizsgáljuk meg, hogy logikailag felbontható-e kisebb egységekre.

Nem a sorok száma a döntő, hanem az, hogy egy fájl lehetőleg **egy jól meghatározott felelősségi körért** feleljen.

---

# Sprint dokumentáció

Minden sprint végén külön összefoglaló készül.

```text
docs/
└── sprints/
    ├── Sprint-00.md
    ├── Sprint-01.md
    ├── Sprint-02.md
    ├── Sprint-03.md
    └── ...
```

Minden sprint dokumentáció tartalmazza:

* A sprint célját
* Az elkészült feladatokat
* A meghozott technikai döntéseket
* A felmerült problémákat
* A következő sprint célkitűzéseit

---

# Hosszú távú cél

A Nightfall Vault egy professzionális, jól dokumentált és könnyen bővíthető aukciós platform, amely modern full-stack fejlesztési gyakorlatokat követ. A cél nem csupán egy működő alkalmazás létrehozása, hanem egy olyan referenciaértékű projekt felépítése is, amely hosszú távon fenntartható és továbbfejleszthető.
