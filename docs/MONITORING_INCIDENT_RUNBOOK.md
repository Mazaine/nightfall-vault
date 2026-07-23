# Monitoring és incidenskezelési átadás

## Minimum monitorok

| Jel | Elérés | Prioritás |
|---|---|---|
| kezdőlap és /health/live | publikus HTTPS uptime | P1, 2 egymás utáni hiba |
| /health/ready | publikus HTTPS, tartalomellenőrzés | P1 |
| TLS lejárat | külső monitor, 30/14/7 nap | P2→P1 |
| scheduler heartbeat, Redis, PostgreSQL, storage | belső readiness/Prometheus | P1 |
| SSE | időzített streaming smoke | P1/P2 |
| 5xx arány | belső metrics/log | P1 küszöb felett |
| disk, memória, CPU | host/container monitor | P2, tartósan P1 |
| backup frissesség és off-site siker | napi job | P1 24–48 óra után |
| restore-smoke utolsó siker | heti job/nyilvántartás | P2, 8 nap után P1 |

UptimeRobot vagy hasonló eszköz csak a kezdőlapot, health/live és health/ready útvonalat figyelje. A `/health/metrics` publikus proxyból 404; a mellékelt Prometheus kizárólag a belső `core` hálózaton a `backend:8000` célt scrape-eli.

Riasztás: P1 azonnali operátori értesítés és 15 percen belüli vizsgálat; P2 munkaidőn belüli vizsgálat; P3 tervezett javítás. A címzettet és helyet külső rendszerben kell beállítani.

## Első incidenslépések

1. időpont, commit/image tag és érintett szolgáltatás rögzítése;
2. `docker compose ... ps`, readiness és legutóbbi korlátozott logok ellenőrzése;
3. szabad tárhely, host memória/CPU, Redis/PostgreSQL és scheduler health ellenőrzése;
4. adatkárosodás gyanújánál írások leállítása és új backup készítése; sem downgrade, sem volume-törlés;
5. döntés a `BACKUP_RESTORE_RUNBOOK.md` táblája alapján;
6. helyreállítás után production-postdeploy gate és incidensjegyzőkönyv.
