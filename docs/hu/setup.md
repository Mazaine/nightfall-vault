# ⚙️ Nightfall Vault – Fejlesztői telepítési útmutató

## A dokumentum célja

Ez az útmutató bemutatja, hogyan lehet a Nightfall Vault projektet egy új fejlesztői környezetben elindítani.

A cél, hogy a projekt néhány lépésben telepíthető legyen Windows, Linux és macOS rendszereken.

---

# Követelmények

A projekt fejlesztéséhez az alábbi szoftverek szükségesek:

## Kötelező

* Git
* Docker Desktop
* Docker Compose
* Visual Studio Code

## Ajánlott

* GitHub Desktop
* Postman vagy Bruno
* DBeaver
* Figma
* Docker Extension VS Code-hoz

---

# Repository klónozása

```bash
git clone https://github.com/FELHASZNÁLÓNÉV/Nightfall-Vault.git
cd Nightfall-Vault
```

---

# Környezeti változók

Másold le az alap konfigurációt:

```bash
cp .env.example .env
```

Windows alatt:

```powershell
copy .env.example .env
```

Ezután töltsd ki a szükséges értékeket.

---

# Docker indítása

```bash
docker compose up --build
```

Első indításkor a konténerek felépítése néhány percet is igénybe vehet.

---

# Elérhetőségek

Frontend

```
http://localhost:5173
```

Backend

```
http://localhost:8000
```

API dokumentáció

```
http://localhost:8000/docs
```

---

# Konténerek

A projekt jelenlegi szolgáltatásai:

* frontend
* backend
* postgres

A későbbi sprintekben bővülhet:

* redis
* nginx
* mailhog (fejlesztői környezet)
* websocket service

---

# Fejlesztési folyamat

Ajánlott munkamenet:

1. Git Pull
2. Új branch létrehozása
3. Fejlesztés
4. Tesztelés
5. Commit
6. Push
7. Pull Request

---

# Branch elnevezések

Új funkció:

```
feature/auth
```

Hibajavítás:

```
bugfix/navbar
```

Dokumentáció:

```
docs/readme
```

---

# Tesztelés

Backend

```bash
docker compose exec backend pytest
```

Frontend

```bash
docker compose exec frontend npm run lint
```

Build

```bash
docker compose exec frontend npm run build
```

---

# Gyakori problémák

## A Docker nem indul

Ellenőrizd, hogy a Docker Desktop fut-e.

---

## A port foglalt

Ellenőrizd, hogy nem fut-e már másik alkalmazás ugyanazon a porton.

---

## Az adatbázis nem érhető el

Várd meg, amíg a PostgreSQL konténer egészséges (healthy) állapotba kerül.

---

# Frissítés

A legfrissebb verzió letöltése:

```bash
git pull
docker compose up --build
```

---

# Fejlesztési alapelvek

* Minden fejlesztés külön branch-en történjen.
* A kód legyen olvasható és jól dokumentált.
* Új funkció előtt készüljön rövid terv.
* Minden nagyobb módosítást kövessen tesztelés.
* A dokumentációt a kóddal együtt frissítsük.

---

# Támogatott platformok

* Windows 11
* Windows 10
* Ubuntu
* Debian
* Fedora
* macOS

A projekt célja, hogy minden támogatott platformon azonos fejlesztői élményt nyújtson Docker használatával.
