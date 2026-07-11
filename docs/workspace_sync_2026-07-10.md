# Nightfall Vault - tiszta munkamappa szinkron riport

Dátum: 2026-07-10

## Kiinduló állapot

Az eredeti aktív projektmappa:

```text
C:\Users\Eszti\Desktop\nightfall-vault
```

A régi aktív mappa a `main` ágon állt, de eltért a megtisztított GitHub `main` ágtól. A Git státusz merge folyamatot és feloldatlan konfliktusokat jelzett.

Régi lokális HEAD:

```text
52bd666fbcad3636f17c30f5061f0c8163843c97
```

Ellenőrzött tisztított remote HEAD a munka megkezdésekor:

```text
73ee20419cee7cd9329cc615cdb029d904895f17
```

## Biztonsági mentések

Teljes biztonsági mentés készült a régi aktív mappáról, `.git` könyvtárral és konfliktusos állapottal együtt:

```text
C:\Users\Eszti\Desktop\nightfall-vault-backup-20260710-1326
```

Külön helyi módosításmentés is készült redaktált patch fájlokkal és untracked fájlmásolatokkal:

```text
C:\Users\Eszti\Desktop\nightfall-vault-local-changes-20260710-1326
```

A külön patch mentésekből a korábbi ismert secret és személyes adat minták redaktálva lettek. A teljes backup változatlanul az eredeti állapot megőrzésére szolgál, és nem kerülhet verziókezelésbe.

## Clean clone

Új tiszta klón készült:

```text
C:\Users\Eszti\Desktop\nightfall-vault-clean
```

A clean klón kezdeti HEAD-je:

```text
73ee20419cee7cd9329cc615cdb029d904895f17
```

## Célzott javítások a clean klónban

A clean klón technikai ellenőrzésekor több backend indulási és tesztkompatibilitási hiba jelent meg. Ezek célzott javítást kaptak:

- `docker-compose.yml`: a CORS JSON-lista átadása stabil, idézett formára lett javítva.
- `backend/app/schemas/newsletter.py`: visszakerült a `NewsletterBulkSendResponse` kompatibilitási alias.
- `backend/app/services/email_service.py`: visszakerült a `send_test_email` wrapper.
- `backend/app/main.py`: az `uploads` könyvtár indulás előtt automatikusan létrejön.
- `backend/app/api/health.py`: a health endpoint a `settings.project_name` értéket adja vissza service névként.
- `backend/tests/test_core_flows.py`: a projekt név elvárás `Nightfall Vault API` értékre frissült.

## Végleges mappacsere

A tiszta klón visszakerült a felhasználó által kért aktív Desktop útvonalra:

```text
C:\Users\Eszti\Desktop\nightfall-vault
```

A korábbi konfliktusos aktív mappa archiválva lett:

```text
C:\Users\Eszti\Desktop\nightfall-vault-old-20260710-1814
```

A sikertelen első mappacsere után visszamaradt részleges szülőmappa külön, nem destruktív archive mappába került:

```text
C:\Users\Eszti\Desktop\nightfall-vault-partial-20260710-181711
```

Az aktív mappa ellenőrzött HEAD-je a mappacsere után:

```text
06d8408f7f8b8e36616a9aefadbc3c4a325c704d
```

A munkafa tiszta volt a mappacsere után.

## Ellenőrzések

Frontend dependency telepítés:

```text
npm ci: sikeres
```

Az eredeti szinkron során az npm audit 1 high severity sérülékenységet jelzett. Ez 2026-07-11-én célzott dependency javítással megoldódott:

- `axios`: `^1.7.9` -> `^1.18.1`
- transitive `form-data`: `4.0.5` -> `4.0.6`

Utólagos ellenőrzés:

```text
npm audit: 0 vulnerabilities
```

Frontend build:

```text
npm run build: sikeres
```

Backend tesztek:

```text
pytest: 8 passed
```

Docker állapot:

```text
frontend: running
backend: running
postgres: running, healthy
redis: running, healthy
```

Health endpoint:

```text
status: ok
service: Nightfall Vault API
```

## Secret ellenőrzés

A clean klónban futtatott ellenőrzés nem talált korábbi ismert jelszó, admin e-mail, alapértelmezett jelszó, MythicalMarkets, `WITHDRAWAL_*` vagy személyes banki adat mintát.

Verziókezelésben csak az alábbi env példafájlok vannak:

```text
.env.example
backend/.env.example
frontend/.env.example
```

A lokális `.env` fájl generált fejlesztői értékekkel készült, nem commitolt, és értékei nincsenek dokumentálva.

## Dokumentációs ellenőrzés

A Markdown dokumentációkban nem maradt hibás sortörés-escape karakterlánc.

## Visszaemelt helyi módosítások

Automatikus, teljes helyi módosítás-visszaemelés nem történt. Csak azok a célzott javítások kerültek be, amelyek a tiszta klón build, teszt és backend indulásához szükségesek voltak.

## Fennmaradó manuális teendők

- A régi backup mappát meg kell őrizni, amíg minden szükséges helyi módosításról eldől, hogy vissza kell-e emelni.
- A régi konfliktusos mappa nem törölhető automatikusan.
- A teljes backup tartalmazhat régi állapotból származó érzékeny adatokat, ezért nem kerülhet Gitbe, felhőbe vagy megosztott tárhelyre.
