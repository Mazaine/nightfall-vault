# Nightfall Vault - Licitjeim oldal és aukciókártya frissítés

Dátum: 2026-07-11

## Licitjeim oldal

A `Licitjeim` oldal az adott felhasználó aukciós központja lett.

Megjelenített részek:

- Aukciók, amelyekre a felhasználó licitált.
- Saját aukciók, amelyeket a felhasználó töltött fel.
- Aukció létrehozása űrlap.

## Licitált aukciók

- Normál aukciókártyát használ, ugyanazt a kártyastílust, mint a többi aukciós lista.
- A felhasználó innen is tud licitálni.
- Ha valaki rálicitált, a kártyán `Rád licitáltak` jelzés jelenik meg.
- Lezárt aukció 24 óráig elszürkítve marad látható, utána a későbbi backend logika szerint eltűnik.

## Saját aukciók

- A saját aukciók normál aukciókártyával jelennek meg.
- Saját aukciónál elérhető:
  - részletezés,
  - módosítás,
  - törlés.
- Lezárt saját aukció szintén 24 óráig elszürkítve marad.

## Módosítási szabályok

Módosítható:

- kép,
- lejárati dátum,
- 5 perces szabály ki/be,
- villámár ki/be,
- leírás.

Nem módosítható:

- kezdőár,
- licitlépcső,
- már megadott villámár összege.

Ezek a szabályok a `Licitjeim` oldalon és a `Hogyan működik?` oldalon is szerepelnek.

## Aukció létrehozása

Az űrlap mezői:

- Név
- Kép
- Leírás
- Kategória
- Állapot
- Kezdőár
- Licitlépcső
- Villámár
- Lejárati dátum
- 5 perces szabály
- Villámár bekapcsolása

Kategóriák:

- Hatalom Kártyái Kártyajáték
- Pokemon
- One Piece
- Star Wars TCG
- Yu-gi-oh
- Magic the Gathering
- Egyéb

Állapotok:

- Frissen Bontott
- Újszerű
- Játszott
- Sérült
- Kopott
- Nyomdahibás

## Aukciókártya

Az aukciókártya bővült:

- eladó neve,
- eladó értékelése,
- licitálás gomb,
- villámár esetén sárga `Lecsapom` gomb villám ikonnal,
- lezárt állapot elszürkítése,
- `Rád licitáltak` jelzés.

## Ellenőrzés

```text
npm run build: sikeres
```

## Megjegyzés

A mostani megvalósítás frontend template állapotú. A 24 órás eltűnés, a valódi licitálás, a törlés és a módosítás backend oldali összekötést igényel a későbbi aukciós domain implementációban.
