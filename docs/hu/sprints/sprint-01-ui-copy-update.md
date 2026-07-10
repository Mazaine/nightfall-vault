# Sprint 01 UI copy update

Date: 2026-07-02

## Mit módosítottam

- A kezdőoldal hero leírását TCG gyűjtői kártya fókuszúra cseréltem.
- A fantasy kategóriákat TCG kategóriákra cseréltem: HKK, Pokémon TCG, Star Wars Unlimited, One Piece Card Game, Egyéb TCG.
- A fantasy demo aukciókat gyűjtői kártyás demo aukciókra cseréltem.
- A felületi terminológiát aukciós és gyűjtői kártyás irányba finomítottam.
- A header és footer látható szövegeinek kódolási hibáit javítottam.

## Miért módosítottam

A Sprint 1 célja továbbra is statikus frontend és design-rendszer alap. A módosítás azért történt, hogy a prémium dark fantasy hangulat megmaradjon, de a termékpozicionálás egyértelműen gyűjtői kártyákra és TCG aukciókra mutasson.

## Érintett fájlok

- `frontend/src/App.tsx`
- `frontend/src/components/SiteHeader.tsx`
- `frontend/src/components/SiteFooter.tsx`
- `docs/hu/sprints/sprint-01-ui-copy-update.md`

## Mi maradt statikus demo adat

- A kategóriák statikus tömbből renderelődnek.
- A kiemelt aukciók statikus demo objektumok.
- Az aktív aukciók oldalsó listája statikus demo adat.
- Az árak, licitlépcsők és hátralévő idők nem valós rendszerből jönnek.

## Mi nem valódi üzleti logika még

- Nincs valós licitálási folyamat.
- Nincs backend kapcsolat.
- Nincs aukció létrehozás, zárás vagy állapotkezelés.
- Nincs fizetési, kosár vagy rendelési logika.
- A `Licitálok` gomb csak statikus UI elem, nem indít műveletet.
