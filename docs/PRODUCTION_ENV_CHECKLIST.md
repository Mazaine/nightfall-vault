# Production környezeti leltár és kitöltési munkalap

Titkot ne küldj chatben, ne írj dokumentációba és ne commitolj. A kitöltött fájl kizárólag a VPS-en legyen: `.env.production`, jogosultsága `chmod 600`.

Jelölések: **O** = operátor/felhasználó, **C** = Codex által előkészített, **V** = csak VPS-en, **D** = domain szolgáltatónál, **K** = külső szolgáltatásban.

## Alkalmazás

| Változó | Szolgáltatás | Kötelező / titkos | Formátum és cél | Biztonságos előállítás | Ki / mikor / validáció |
|---|---|---|---|---|---|
| ENVIRONMENT | backend | kötelező / publikus | pontosan `production` | kézi konstans | O, deploy előtt, validator |
| SECRET_KEY | backend | kötelező / titkos | legalább 48 karakter, nagy entrópia | `openssl rand -base64 48` | O+V, deploy előtt, validator |
| APP_FRONTEND_URL | frontend/backend | kötelező / publikus | `https://domain.tld` | DNS/TLS döntésből | O+D, build előtt, validator |
| APP_BACKEND_URL, FRONTEND_BASE_URL | backend | kötelező / publikus | jelenlegi same-origin architektúrában azonos HTTPS URL | APP_FRONTEND_URL másolata | O, deploy előtt, validator |
| BACKEND_CORS_ORIGINS | backend | kötelező / publikus | konkrét HTTPS origin JSON-listája | pl. `["https://vault.invalid"]` csak minta | O, deploy előtt, validator |
| TRUSTED_PROXY_CIDRS | backend | kötelező / belső | konkrét proxy CIDR JSON-listája | alaparchitektúrában `["172.30.0.10/32"]` | C+O, deploy előtt, validator |
| VITE_SUPPORT_EMAIL | frontend | kötelező / publikus | valós támogatási e-mail | létrehozott mailbox | O+K, build előtt, validator |
| TZ | konténerek/operátor | ajánlott / publikus | IANA időzóna, `Europe/Budapest` | kézi | O, deploy előtt |
| LOG_LEVEL, LOG_FORMAT | backend | kötelező / publikus | `INFO`, `json` | minta szerint | C+O, deploy előtt |
| NIGHTFALL_IMAGE_TAG | minden saját image | kötelező / publikus | 7–40 karakteres Git commit hash | `git rev-parse --short=12 HEAD` | V, build előtt, validator |
| HTTP_BIND, HTTP_PORT | reverse proxy | kötelező / belső | `127.0.0.1`, nem privilegizált port | minta: 8080 | C+V, validator |

## PostgreSQL és Redis

| Változó | Szolgáltatás | Kötelező / titkos | Formátum és cél | Generálás | Ki / validáció |
|---|---|---|---|---|---|
| POSTGRES_DB, POSTGRES_USER | postgres/backend | kötelező / publikus | egyszerű azonosító | minta módosítható | O, validator |
| POSTGRES_PASSWORD | postgres/backend | kötelező / titkos | legalább 24 karakter | `openssl rand -base64 32` | O+V, validator |
| DATABASE_URL | backend | kötelező / titkos | `postgresql+psycopg://user:URL_ENCODED_PASSWORD@postgres:5432/db` | az előző adatokból | O+V, validator |
| DATABASE_VOLUME_NAME | postgres | kötelező / publikus | stabil Docker volume név | minta szerint | C+O, validator |
| REDIS_PASSWORD | redis/backend | kötelező / titkos | legalább 24 karakter | `openssl rand -base64 32` | O+V, validator |
| REDIS_URL | backend | kötelező / titkos | `redis://:URL_ENCODED_PASSWORD@redis:6379/0` | az előző jelszóból | O+V, validator |
| REDIS_VOLUME_NAME | redis | kötelező / publikus | stabil Docker volume név | minta szerint | C+O, validator |
| REALTIME_STREAM_MAX_LENGTH | backend | kötelező / publikus | egész, legalább 100; ajánlott 5000 | kapacitási döntés | C+O, backend config |

Redis AOF persistence és `noeviction` policy a Compose-ban rögzített, Redis/PostgreSQL publikus portot nem kap.

## E-mail és CAPTCHA

| Változó | Kötelező / titkos | Feltétel / formátum | Ki / validáció |
|---|---|---|---|
| EMAIL_DELIVERY_ENABLED | kötelező / publikus | `false` az előkészítéskor; `true` csak kész providerrel | O+K, validator |
| NOTIFICATION_EMAIL_ENABLED | kötelező / publikus | kategória e-mailek globális kapcsolója | O |
| BREVO_API_KEY | feltételes / titkos | Brevo production API key | O+K, validator ha delivery aktív |
| BREVO_SENDER_EMAIL, BREVO_SENDER_NAME | feltételes / publikus | hitelesített feladó | O+K, validator |
| SMTP_HOST/PORT/USER/PASSWORD | feltételes / részben titkos | alternatív teljes SMTP-konfiguráció | O+K, validator |
| SMTP_FROM_EMAIL, SMTP_FROM_NAME | feltételes / publikus | hitelesített feladó | O+K, validator |
| CAPTCHA_ENABLED | kötelező / publikus | `true/false` | O+K, validator |
| CAPTCHA_PROVIDER, VITE_CAPTCHA_PROVIDER | feltételes / publikus | `turnstile` | C+O |
| TURNSTILE_SECRET_KEY | feltételes / titkos | szerveroldali kulcs | O+K, validator |
| VITE_CAPTCHA_SITE_KEY | feltételes / publikus | böngészős site key | O+K, validator |

A reply-to jelenleg a hitelesített feladó címe; külön reply-to változó nincs az aktív alkalmazási szerződésben.

## Média, monitoring és backup

| Változó | Kötelező / titkos | Formátum és cél | Ki / validáció |
|---|---|---|---|
| MEDIA_ROOT | kötelező / belső | abszolút Linux út, alap: `/data/media` | C, validator |
| MEDIA_URL_PREFIX | kötelező / publikus | dedikált URL prefix, alap: `/media` | C, backend config |
| MEDIA_VOLUME_NAME | kötelező / publikus | stabil named volume | C+O, validator |
| MAX_IMAGE_* | ajánlott / publikus | fájl-, pixel-, szélesség- és magasságlimit | C+O |
| ERROR_TRACKING_DSN | opcionális / titkos | külső error tracker DSN | O+K |
| UPTIME_CHECK_URL | opcionális / publikus | HTTPS readiness vagy kezdőlap | O+K |
| MONITORING_ALERT_RECIPIENT | opcionális / személyes | operátori címzett | O+K |
| BACKUP_DIRECTORY | kötelező / belső | abszolút, nem publikus VPS út | O+V, validator |
| BACKUP_RETENTION_DAYS | kötelező / publikus | legalább 1, ajánlott 14 | O, validator |
| BACKUP_MIN_FREE_MB | ajánlott / publikus | minimum szabad hely MB | C+O |
| OFFSITE_BACKUP_MODE | kötelező / publikus | `disabled`, `rclone` vagy `rsync` | O, validator |
| OFFSITE_BACKUP_TARGET | feltételes / titkos lehet | rclone remote vagy rsync/SSH cél | O+K, validator |
| ALLOW_PRODUCTION_RESTORE | kötelező biztonsági kapcsoló | alapállapotban `NO`; csak kézi restore idejére `YES` | O+V, validator |

## Operátori checkbox

- [x] **C** Compose, named volume, belső/publikus hálózat és validator előkészítve.
- [ ] **O+D** Production domain kiválasztva; DNS A/AAAA rekord beállítva.
- [ ] **O+V** TLS tanúsítvány és automatikus megújítás ellenőrizve.
- [ ] **O+K** Support e-mail és feladó domain létrehozva.
- [ ] **O+K** Brevo vagy SMTP credential létrehozva; SPF, DKIM, DMARC beállítva.
- [ ] **O+K** Turnstile site key és secret key létrehozva.
- [ ] **O+V** SECRET_KEY, PostgreSQL- és Redis-jelszó generálva.
- [ ] **O+K** Off-site backup cél beállítva és ellenőrizve.
- [ ] **O+K** Monitoring címzett és uptime ellenőrzés megadva.
- [ ] **O** Jogi/üzemeltetői adatok véglegesítve.
- [x] **C** Production admin egyszer használatos CLI előkészítve.
- [ ] **O+V** Első admin személye jóváhagyva és a CLI kézzel lefuttatva.
