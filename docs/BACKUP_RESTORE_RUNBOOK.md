# Backup, restore-smoke és rollback runbook

## Backup

`PRODUCTION_ENV_FILE=.env.production ./scripts/backup_production.sh`

A script szabad helyet ellenőriz, partial könyvtárba PostgreSQL custom dumpot és média tar.gz-t készít, SHA-256 checksumot generál, majd manifestbe írja az UTC időt, Git commitot, Alembic revisiont, alapvető rekordszámokat és egy mintamédia hashét. Csak siker után nevezi véglegesre. Retention csak végleges, dátumozott mentést érint; a backup útvonal Gitből kizárt és nem publikus.

Off-site alapérték: `disabled`. Aktiválás előtt állíts `rclone` remote-ot vagy szűk jogosultságú rsync/SSH célt, majd `OFFSITE_BACKUP_MODE` és `OFFSITE_BACKUP_TARGET`. Ellenőrzés: céloldali fájllista és `sha256sum -c SHA256SUMS`.

Napi futtatás systemd timerrel ajánlott, dedikált service userrel. A service `OnFailure` egysége az operátori riasztási csatornát hívja; sikernek csak 0 exit code és friss, checksum-ellenőrzött könyvtár számít.

## Izolált restore-smoke

`./scripts/restore_smoke_test.sh /srv/nightfall-vault/backups/IDŐBÉLYEG`

Külön ideiglenes PostgreSQL konténert, adat- és médiavolume-ot használ; checksumot, revisiont, users/auctions rekordszámot és mintamédia hashét ellenőrzi. EXIT trap eltávolítja a konténert és volume-okat. Production adatot nem érint.

## Production restore

Csak jóváhagyott incidensben:

1. író szolgáltatások leállításának és maintenance kommunikációnak előkészítése;
2. `ALLOW_PRODUCTION_RESTORE=YES` ideiglenes beállítása;
3. `./scripts/restore_production.sh BACKUP_KÖNYVTÁR --confirm-data-loss`;
4. automatikus pre-restore backup, checksum, restore, alkalmazásindítás és smoke;
5. Alembic current, médiaaudit és üzleti rekordszám ellenőrzése;
6. `ALLOW_PRODUCTION_RESTORE=NO` visszaállítása.

Automatikus Alembic downgrade tilos.

## Rollback döntési tábla

| Hiba | Ajánlott művelet |
|---|---|
| csak frontend | korábbi immutable frontend/proxy/backend azonos release tag vagy javított forward deploy |
| backend image, migráció nélkül | `ROLLBACK_IMAGE_TAG=HASH` alkalmazás-rollback |
| backend, kompatibilis előre migráció | image rollback csak dokumentált kompatibilitás esetén |
| adatkárosodás | írások leállítása, incidensmentés, izolált restore-smoke, jóváhagyott production restore |
| médiahiba | média-hozzáférés leállítása, backup checksum és célzott/végleges restore |
| Redis hiba | Redis/AOF health, jelszó és volume ellenőrzése; adatbázist ne állíts vissza |
| teljes szerverhiba | új VPS, auditált commit/image, volume/backup restore, teljes postdeploy gate |

Rollback: `ROLLBACK_IMAGE_TAG=KORABBI_HASH PRODUCTION_ENV_FILE=.env.production ./scripts/rollback_production.sh`. Ellenőrzi az image-eket, megmutatja a jelenlegi/cél taget, megerősítést kér, titokmentes állapotfájlt ment, és smoke tesztet futtat.
