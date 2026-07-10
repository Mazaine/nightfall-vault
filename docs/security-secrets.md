# Secret kezelés és local admin létrehozás

Ez a projekt nem tartalmazhat valódi jelszót, API-kulcsot vagy éles secretet a repositoryban.

## Alapszabályok

- `.env` fájl soha nem kerülhet verziókezelésbe.
- `.env.example` csak példaértékeket tartalmazhat.
- Admin felhasználót nem hozunk létre hardcoded jelszóval.
- Production környezetben tilos fejlesztői admin seedet futtatni.
- Valódi Brevo, Turnstile, SMTP, JWT vagy adatbázis secret nem lehet commitban.

## Secret generálás PowerShellből

JWT secret generálás:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
```

PostgreSQL jelszó generálás:

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

Admin ideiglenes jelszó generálás:

```powershell
-join ((48..57 + 65..90 + 97..122 + 33 + 35 + 36 + 37 + 38 + 42) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

## Local admin létrehozása

A seed script csak akkor fut, ha a szükséges változók meg vannak adva. Production környezetben megtagadja a futást.

```powershell
docker compose exec -T backend python -m app.scripts.seed_dev_admin
```

A script a jelszót nem írja ki. Siker esetén csak az admin e-mail címet jelzi.
