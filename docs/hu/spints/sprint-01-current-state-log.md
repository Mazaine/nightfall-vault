# Nightfall Vault - Sprint 1 teljes állapotlog

Dátum: 2026-07-03

## Rövid összefoglaló

A Nightfall Vault jelenlegi állapota egy statikus, prémium dark fantasy hangulatú TCG aukciós platform kezdőoldal. A felület gyűjtői kártyákra fókuszál, de még nem tartalmaz valódi aukciós, licitálási vagy backendhez kötött frontend funkciót.

## Aktív cél

- Sprint 1-ben a cél a frontend struktúra, design rendszer, vizuális irány és statikus demo felület kialakítása.
- A projekt jelenleg nem webshopként, hanem gyűjtői kártyás aukciós platformként pozicionálja magát.
- A backend Dockerben fut, de az aktív kezdőoldal nem használ backend adatot.

## Jelenlegi felületi állapot

### Branding

- A header és a footer ugyanazt az átlátszó hátterű logót használja:
  - `frontend/public/assets/nightfall-vault-logo.png`
- A logóban az `AUCTION HOUSE` felirat lila.
- A footerben a logó nagyobb méretben jelenik meg, mint a headerben.
- A korábbi fehér logóháttér eltávolításra került.

### Hero

- A hero háttérképe:
  - `frontend/public/assets/nightfall-castle-background.png`
- A hero továbbra is dark fantasy kastélyos hangulatot ad.
- A hero szöveg TCG fókuszú:
  - gyűjtői kártyák
  - aktuális aukciók
  - ritka darabokra licitálás
  - gyűjtemény bővítése

### Kategóriák

Az aktív statikus kategóriák:

- HKK
- Pokémon TCG
- Star Wars Unlimited
- One Piece Card Game
- Egyéb TCG

### Demo aukciók

Az aktív kiemelt demo aukciók statikus tömbből renderelődnek:

- HKK - Ősi rúna fóliás lap
- Pokémon TCG - Charizard ex
- Star Wars Unlimited - Darth Vader showcase
- One Piece Card Game - Monkey D. Luffy leader
- HKK - Ritka versenylap csomag
- Pokémon TCG - Booster display bontatlan

Az oldalsó aktív aukció lista szintén statikus demo adat.

## Aktív frontend fájlok

Fő belépési pontok:

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`

Komponensek:

- `frontend/src/components/SiteHeader.tsx`
- `frontend/src/components/SiteHeader.css`
- `frontend/src/components/SiteFooter.tsx`
- `frontend/src/components/SiteFooter.css`

Design rendszer:

- `frontend/src/styles/index.css`
- `frontend/src/styles/tokens/colors.css`
- `frontend/src/styles/tokens/spacing.css`
- `frontend/src/styles/tokens/typography.css`
- `frontend/src/styles/tokens/radius.css`
- `frontend/src/styles/tokens/shadows.css`
- `frontend/src/styles/tokens/z-index.css`
- `frontend/src/styles/tokens/transitions.css`
- `frontend/src/styles/themes/dark.css`
- `frontend/src/styles/base/reset.css`
- `frontend/src/styles/base/global.css`
- `frontend/src/styles/base/animations.css`
- `frontend/src/styles/utilities/*`

## Legacy állapot

A korábbi webshop-template frontend jelentős része archívumba került:

- `frontend/src/_legacy/`

Itt találhatók többek között:

- régi API kliensek
- auth context és hookok
- régi webshop oldalak
- cart/checkout/admin/product komponensek
- régi i18n fájlok
- régi global CSS

Ezek nincsenek aktívan használva a Sprint 1 kezdőoldalon.

## Docker és backend állapot

Docker Compose projekt neve:

- `nightfall-vault`

Futó szolgáltatások:

- `frontend` - Vite dev server, port `5173`
- `backend` - FastAPI, port `8000`
- `postgres` - PostgreSQL, port `5432`, healthy
- `redis` - Redis, healthy

Backend health ellenőrzés:

```json
{"status":"ok","service":"Nightfall Vault API"}
```

Frontend elérhetőség:

- `http://localhost:5173` válaszol, HTTP `200`

## Legutóbbi ellenőrzések

Frontend build:

```bash
npm.cmd run build
```

Eredmény:

- TypeScript build sikeres.
- Vite production build sikeres.
- 31 modul transzformálva.

Docker Compose állapot:

```bash
docker compose ps
```

Eredmény:

- frontend fut
- backend fut
- postgres healthy
- redis healthy

## Mi statikus demo adat még

- Kategóriák
- Kiemelt aukciók
- Aktív aukció lista
- Árak
- Licitlépcsők
- Időzítők
- Trust panel tartalma
- Header/footer linkek

## Mi nem valódi üzleti logika még

- Nincs valódi licitálás.
- Nincs aukció létrehozás.
- Nincs aukció zárás.
- Nincs felhasználói ajánlattétel.
- Nincs fizetési folyamat.
- Nincs backendből betöltött aukciós adat.
- Nincs valós keresés vagy kategóriaszűrés.
- A `Licitálok` gomb csak vizuális statikus UI elem.

## Ismert technikai megjegyzések

- A Windows PowerShell bizonyos kimenetekben rosszul jelenítheti meg az UTF-8 magyar ékezeteket, de a böngészős felület és a forrásfájlok célja UTF-8 magyar szöveg.
- A régi webshop backend modellek és endpointok még több helyen megtalálhatók, de a Sprint 1 frontend nem épít rájuk.
- A `frontend/src/_legacy/` megőrzött archívum, nem aktív termékfelület.

## Következő javasolt lépések

- A logó méretének és elhelyezésének vizuális finomhangolása mobilon.
- TCG kártya jellegű statikus kártya-előnézeti grafikai elemek készítése.
- Későbbi sprintben aukciós domain modell tervezése backend oldalon.
- Későbbi sprintben valódi aukciós API és frontend adatlekérés kialakítása.
