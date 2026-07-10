# 🌑 Nightfall Vault

> **Modern, teljes értékű aukciós platform React, FastAPI és Docker technológiákkal.**

A **Nightfall Vault** egy hosszú távú full-stack fejlesztési projekt, amelynek célja egy modern, biztonságos és skálázható aukciós platform létrehozása.

A projekt egyszerre szolgál:

* tanulási projektként,
* szakmai portfólióként,
* valamint egy később akár éles környezetben is használható webalkalmazás alapjaként.

A fejlesztés sprintenként, részletes dokumentációval és professzionális szoftverfejlesztési szemlélettel történik.

---

# 🎯 Célkitűzés

A Nightfall Vault célja egy olyan aukciós rendszer elkészítése, amely:

* modern felhasználói élményt nyújt,
* biztonságos,
* könnyen bővíthető,
* mobilbarát,
* többnyelvű (magyar / angol),
* Docker-alapú fejlesztési környezetet használ.

---

# 🛠 Technológiai stack

## Frontend

* React
* TypeScript
* Vite
* React Router

## Backend

* FastAPI
* SQLAlchemy
* PostgreSQL
* Alembic
* JWT hitelesítés

## Infrastruktúra

* Docker
* Docker Compose

---

# 📁 Projekt felépítése

```text
Nightfall-Vault/
│
├── frontend/
├── backend/
├── docs/
├── .github/
├── docker-compose.yml
├── .env.example
├── README.md
└── README_EN.md
```

---

# 🚧 Projekt állapota

## Sprint 0 – Projekt előkészítés

Jelenlegi célok:

* projektstruktúra kialakítása
* dokumentáció elkészítése
* architektúra megtervezése
* felhasználói felület megtervezése
* fejlesztési folyamat előkészítése

Ebben a sprintben még **nem készül aukciós funkció**.

---

# 📋 Tervezett funkciók

## Felhasználók

* Regisztráció
* Bejelentkezés
* Jelszó-visszaállítás
* E-mail megerősítés
* Jogosultsági rendszer

## Aukció

* Aukció létrehozása
* Licitálás
* Automatikus lezárás
* Licittörténet
* Minimum ár
* Azonnali vásárlás lehetősége

## Felhasználói funkciók

* Profil
* Kedvencek
* Figyelőlista
* Értesítések
* Vásárlási előzmények

## Admin felület

* Irányítópult
* Felhasználókezelés
* Aukciók kezelése
* Riportok
* Rendszerbeállítások

---

# 📚 Dokumentáció

A projekt részletes dokumentációja a `docs` mappában található.

Tervezett dokumentumok:

* Architektúra
* API dokumentáció
* Adatbázis
* UI Design System
* Fejlesztői útmutató
* Roadmap

---

# 💡 Fejlesztési alapelvek

A projekt fejlesztése során kiemelt szempont:

* tiszta architektúra,
* kis lépésekben történő fejlesztés,
* jól olvasható kód,
* újrafelhasználható komponensek,
* biztonságközpontú szemlélet,
* Mobile First megközelítés,
* akadálymentesség,
* folyamatos dokumentáció.

---

# 📄 Licenc

A projekt jelenleg aktív fejlesztés alatt áll.

A licenc az első nyilvános kiadás előtt kerül meghatározásra.

---

# 🔐 Secret kezelés és local admin

A repository nem tartalmazhat valódi jelszót, API-kulcsot vagy éles secretet. A .env fájlok ignorálva vannak, a .env.example fájlok csak példaértékeket tartalmazhatnak.

Local admin létrehozása kizárólag környezeti változóval történhet. A seed script nem tartalmaz és nem ír ki jelszót.

Részletes útmutató: docs/security-secrets.md.

