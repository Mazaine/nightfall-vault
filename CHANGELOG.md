# Changelog

A projekt minden jelentősebb változtatása ebben a dokumentumban kerül rögzítésre.

A formátum a **Keep a Changelog** ajánlásait követi, a verziózás pedig a **Semantic Versioning (SemVer)** szabályai szerint történik.

---

## [Unreleased]

### Added

* Projekt létrehozása
* Nightfall Vault projekt név
* Magyar README
* Angol README előkészítése
* Projekt roadmap
* Architektúra dokumentáció
* Style Guide
* Adatbázis-terv
* ER diagram
* Fejlesztői telepítési útmutató
* CONTRIBUTING útmutató

---

## [0.1.0] - Sprint 0

### Added

* Repository inicializálása
* Projektstruktúra kialakítása
* Dokumentációs alapok
* Git szabályok
* Fejlesztési irányelvek
* Design System tervezése
* Architektúra tervezése
* Adatbázis tervezése

---

## Verziózási szabályok

A projekt a Semantic Versioning (SemVer) szabályait követi.

Verzió formátuma:

MAJOR.MINOR.PATCH

Példák:

* 0.1.0
* 0.2.0
* 0.3.1
* 1.0.0

### MAJOR

Kompatibilitást megtörő változások.

Példa:

* teljes backend átalakítása
* API inkompatibilis módosítása

### MINOR

Új funkciók, amelyek visszafelé kompatibilisek.

Példa:

* új licitfunkció
* új admin oldal
* értesítési rendszer

### PATCH

Hibajavítások.

Példa:

* validáció javítása
* CSS javítás
* teljesítmény optimalizálás

---

## Verziók

| Verzió | Állapot            |
| ------ | ------------------ |
| 0.1.x  | Projekt alapok     |
| 0.2.x  | Frontend alapok    |
| 0.3.x  | Backend alapok     |
| 0.4.x  | Hitelesítés        |
| 0.5.x  | Aukciók            |
| 0.6.x  | Licitrendszer      |
| 0.7.x  | Admin felület      |
| 0.8.x  | Üzleti funkciók    |
| 0.9.x  | Release Candidate  |
| 1.0.0  | Első stabil kiadás |

---

## Naplózási szabályok

Minden kiadásnál lehetőség szerint az alábbi szakaszokat használjuk:

### Added

Új funkciók.

### Changed

Módosított funkciók.

### Deprecated

Elavult funkciók.

### Removed

Eltávolított funkciók.

### Fixed

Hibajavítások.

### Security

Biztonsági javítások.

---

## Megjegyzés

A fejlesztés Sprint-alapon történik.

Minden sprint lezárásakor:

* frissül a CHANGELOG,
* frissül a Roadmap (ha szükséges),
* elkészül a Sprint Review dokumentáció,
* létrejön egy Git tag a kiadáshoz.
