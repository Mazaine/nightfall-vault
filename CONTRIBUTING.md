# 🤝 Contributing Guide

Köszönjük, hogy hozzájárulsz a Nightfall Vault fejlesztéséhez!

A projekt célja egy modern, jól dokumentált és hosszú távon fenntartható aukciós platform létrehozása. Annak érdekében, hogy a kódbázis egységes maradjon, kérjük az alábbi irányelvek betartását.

---

# Fejlesztési alapelvek

A projekt fejlesztése során az alábbi elveket követjük:

* Tiszta architektúra
* Kis, jól elkülöníthető feladatok
* Újrafelhasználható komponensek
* Egységes kódstílus
* Folyamatos dokumentáció
* Tesztelhető megoldások
* Biztonságközpontú fejlesztés

---

# Fejlesztési folyamat

1. Forkold vagy klónozd a repositoryt.
2. Hozz létre egy új branchet.
3. Készítsd el a módosításokat.
4. Teszteld a változtatásokat.
5. Frissítsd a dokumentációt, ha szükséges.
6. Készíts egy jól érthető commitot.
7. Nyiss Pull Requestet.

---

# Branch elnevezések

Új funkció:

```text
feature/auction-details
```

Hibajavítás:

```text
bugfix/navbar-overflow
```

Dokumentáció:

```text
docs/update-readme
```

Refaktor:

```text
refactor/auth-service
```

---

# Commit szabályok

Használjuk a Conventional Commits formátumot.

Példák:

```text
feat: add auction details page

fix: resolve login validation issue

docs: update roadmap

refactor: split authentication service

test: add auction API tests

build: update docker configuration

ci: improve GitHub Actions workflow
```

---

# Kódolási szabályok

## Általános

* Azonosítsuk a problémát, mielőtt megoldást írunk.
* Egy komponens lehetőleg egy feladatot lásson el.
* Kerüljük a felesleges ismétlést (DRY).
* Törekedjünk egyszerű, jól olvasható megoldásokra.

---

## Elnevezések

* React komponensek: PascalCase
* Függvények: camelCase
* Változók: camelCase
* Konstansok: UPPER_SNAKE_CASE
* Mappák: kebab-case vagy feature-alapú

---

# Dokumentáció

Minden jelentősebb módosítás esetén frissítsük a kapcsolódó dokumentációt.

Ha új modult vezetünk be, annak működését is dokumentáljuk.

---

# Tesztelés

Pull Request előtt ajánlott lefuttatni:

Backend:

```bash
docker compose exec backend pytest
```

Frontend:

```bash
docker compose exec frontend npm run lint
```

Build:

```bash
docker compose exec frontend npm run build
```

---

# Pull Request ellenőrzőlista

A Pull Request előtt ellenőrizd:

* A projekt lefordul.
* A tesztek sikeresen lefutnak.
* Nincs indokolatlanul kommentben hagyott kód.
* A dokumentáció frissült, ha szükséges.
* A változtatás nem rontotta a meglévő funkciókat.

---

# Kommunikáció

Ha egy nagyobb változtatást tervezel, előtte érdemes Issue-t nyitni és röviden ismertetni az elképzelést.

Ez segít elkerülni a párhuzamos vagy egymásnak ellentmondó fejlesztéseket.

---

# Köszönjük!

Minden hozzájárulás segít abban, hogy a Nightfall Vault egy modern, megbízható és jól dokumentált nyílt forráskódú projekt legyen.
