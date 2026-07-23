# Béta release gate munkalap

## Local preflight

- [ ] Git munkafa tiszta, commit/tag azonosítható.
- [ ] `.env.production` kitöltve, chmod 600, validator sikeres.
- [ ] `PRODUCTION_ENV_FILE=.env.production ./scripts/release_gate.sh local-preflight` sikeres.
- [ ] Backend/frontend tesztek, production build/image és nginx config sikeres.
- [ ] Médiaaudit 0/0; secret scan és git diff check tiszta.
- [ ] Backup/restore-smoke eszköz végrehajtható.

## Külső/VPS kapuk

- [ ] DNS, TLS, automatikus renew és HTTPS redirect ellenőrzött.
- [ ] E-mail domain, SPF/DKIM/DMARC és explicit smoke sikeres.
- [ ] CAPTCHA valós kulcsokkal működik.
- [ ] Első admin kézzel, auditált CLI-vel készült.
- [ ] Első backup és izolált restore-smoke sikeres.
- [ ] Off-site backup cél és napi automatizálás működik.
- [ ] Monitoring címzettek, prioritások és incidensfelelős rögzítve.
- [ ] Jogi/üzemeltetői adatok jóváhagyva.
- [ ] `PRODUCTION_ENV_FILE=.env.production SMOKE_BASE_URL=https://DOMAIN ./scripts/release_gate.sh production-postdeploy` sikeres.

Sikertelen pontnál a béta nem indul; a hiba javítása után az érintett gate-et újra kell futtatni.
