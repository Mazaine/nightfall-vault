# Nightfall Vault - navbar, hero és footer célzott frissítés

Dátum: 2026-07-11

## Módosítások

- A navbar menüpontjai egy soros desktop elrendezéshez lettek igazítva.
- A navbar sorrendje:
  - Kezdőlap
  - Licitjeim
  - Aukciók
  - Kategóriák
  - Hogyan működik?
  - Rólunk
  - Kapcsolat
- A `Termékek` menüpont kikerült, helyette `Licitjeim` került be.
- A kosár ikon helyére profil ikon került.
- A keresés ikon maradt nagyító ikon.
- Vendég felhasználónál megmarad a `Belépés` és `Regisztráció` gomb.
- Bejelentkezett felhasználónál a header a felhasználó nevét jeleníti meg, ha a frontend `localStorage` alatt talál `nightfall_user` adatot.
- A navbar logó admin felhasználónál az admin oldalra visz, normál felhasználónál és vendégnél a kezdőlapra.
- A footerből kikerült az `Admin` link.
- A header és footer háttérszíne a logo hátteréhez lett igazítva.
- A hero kép `nightfall-castle-background.png` lett.
- A főoldali hero aktív aukciók oldalsó panelje lekerült.
- A főoldali kategóriasáv lekerült.
- Az aktív termék route-ok kikerültek a frontend routerből.
- Az admin termék oldal helyett admin aukció oldal került be: `/admin/auctions`.

## Biztonsági megjegyzés

- Új jelszó, token, API kulcs vagy admin belépési adat nem került a kódba.
- A `.gitignore` célzottan bővült tipikus secret, credential és kulcs fájlmintákkal.
- A secret ellenőrzés nem talált valós kiszivárgott adatot az aktív repóban.

## Ellenőrzések

```text
npm run build: sikeres
docker compose exec -T backend pytest: 8 passed
```

## Megjegyzés

A header jelenleg a `localStorage` `nightfall_user` kulcsából olvassa a felhasználó nevét és admin státuszát. A későbbi teljes auth integrációnál ezt érdemes a backend `/api/auth/me` válaszával vagy központi auth contexttel összekötni.
