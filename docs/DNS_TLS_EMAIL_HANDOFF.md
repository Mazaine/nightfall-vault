# DNS, TLS és production e-mail átadás

## Ajánlott alapút: Nginx + Let's Encrypt/Certbot

1. A domain szolgáltatónál állíts A rekordot a VPS IPv4-címére; AAAA csak működő IPv6 esetén. Várd meg, míg a rekord publikus lekérdezése a VPS-re mutat.
2. A HTTP-01 challenge alatt a 80-as port legyen elérhető, a domain ne mutasson más proxyra. Cloudflare használatakor a rekord ideiglenesen „DNS only” legyen.
3. Telepítsd a Certbotot az Ubuntu csomagolási ajánlása szerint, majd kérj tanúsítványt a valós domainre.
4. A Compose reverse proxy csak loopbacken, `127.0.0.1:8080` címen figyel. A host Nginx fogadja a publikus 80/443 forgalmat. A `nginx/tls.example.conf` csak host-minta: másold az aktív szerverkonfigurációba a valós `server_name` és cert útvonalakkal.
5. Előbb `nginx -t`, utána reload; ellenőrizd a HTTPS kezdőlapot, health-t és SSE-t.
6. Csak stabil HTTPS után aktiváld a HTTP→HTTPS redirectet, majd a HSTS-t. Hibás TLS-re HSTS-t ne küldj.
7. Megújítás: `sudo certbot renew --dry-run`; ellenőrizd a timer állapotát.

Opcionális Cloudflare proxy illeszkedhet, de nem alapértelmezett. Proxy esetén a valódi kliens-IPhez kizárólag a Cloudflare dokumentált CIDR-jei és helyes header-kezelés használható; wildcard trusted proxy tilos. Cloudflare Tunnelre automatikus átállás nem történt.

## DNS/e-mail preflight

- [ ] feladó domain és support mailbox kész;
- [ ] SPF tartalmazza a választott szolgáltatót;
- [ ] DKIM rekord a provider szerint ellenőrzött;
- [ ] DMARC kezdetben megfigyelő policyval, jelentési címmel beállítva;
- [ ] Brevo/SMTP sandbox korlátozás megszűnt vagy a béta-címzettek engedélyezettek;
- [ ] feladó név/e-mail és reply-to viselkedés ellenőrzött;
- [ ] EMAIL_DELIVERY_ENABLED és szükség esetén NOTIFICATION_EMAIL_ENABLED tudatosan aktivált;
- [ ] aktiválás, jelszó-reset, tranzakciós és moderációs levél egy-egy engedélyezett tesztfiókkal ellenőrzött;
- [ ] rate limitek és logredakció ellenőrzött; teljes token vagy credential nem kerül logba.

## Explicit e-mail smoke

Nincs production teszt HTTP-végpont. Kizárólag kézi, explicit címzettel és megerősítéssel:

`docker compose --env-file .env.production -f docker-compose.production.yml run --rm backend python -m app.scripts.send_production_email_smoke --to ELLENORZOTT_CIM --confirm-send`

A parancs nem írja ki a kulcsot, jól azonosítható tárgyat használ, szolgáltatói hiba esetén nem nulla exit code-dal áll le. Valós címre csak a címzett engedélyével futtasd.
