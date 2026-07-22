const steps = [
  ["Regisztráció és belépés", "Aukciót és licitet csak aktív, ellenőrzött fiókkal lehet létrehozni."],
  ["Aukció létrehozása", "Az eladó megadja a leírást, képeket, állapotot, kezdőárat, licitlépcsőt és az időzítést."],
  ["Licitálás", "Az aktív aukción a backend ellenőrzi a minimum licitet, a jogosultságot, a villámárat és a bekapcsolható, lejárat után induló +5 perces hosszabbítást."],
  ["Aukció lezárása", "Nyertes nélkül az aukció eladatlanul zárul. Nyertes esetén pontosan egy, biztonságosan követett tranzakció nyílik."],
  ["Privát egyeztetés", "Az eladó és a nyertes a privát aukciós chatben egyezteti a fizetést, az átadást vagy a szállítást. A Nightfall Vault ezeket nem kezeli."],
  ["Kölcsönös megerősítés", "Mindkét fél külön erősíti meg, hogy az adásvétel megtörtént. Egyetlen fél nyilatkozata nem zárja le a tranzakciót."],
  ["Értékelés és archiválás", "A kölcsönös teljesítés után a felek egyszer, 1–5 csillaggal értékelhetik egymást. A lezárt előzmények auditálhatóan megmaradnak."],
  ["Moderáció", "A figyelmeztetés tájékoztatás, a strike naplózott szabálysértési jelzés, a tiltás pedig meghatározott funkciót vagy a teljes fiókot korlátozza. Végleges tiltásról mindig admin dönt."],
] as const;

export function HowItWorksPage() {
  return <section className="container page-shell">
    <p className="eyebrow">Folyamat</p><h1>Hogyan működik?</h1>
    <div className="info-grid">{steps.map(([title, text], index) => <article className="side-panel info-card" key={title}><span>{index + 1}</span><h2>{title}</h2><p>{text}</p></article>)}</div>
    <section className="side-panel rules-panel" aria-labelledby="bidding-rules-title">
      <p className="eyebrow">Átlátható licitálás</p>
      <h2 id="bidding-rules-title">Licitálási szabályok</h2>
      <ul>
        <li>Az aukciókártyán csak az aukció nevére kattintva nyílik meg a részletes licitoldal. A kép és a kártya többi része nem navigál.</li>
        <li>A kártya <strong>Licitálok</strong> gombja oldalváltás nélkül az aktuális licithez ad egy teljes licitlépcsőt. Nem szükséges külön összeget beírni.</li>
        <li>A részletes licitoldalon üresen hagyott összegmező szintén a következő teljes licitlépcsőt küldi be.</li>
        <li>Egyedi összeg megadható, de nem lehet kisebb az aktuális licit és egy licitlépcső összegénél. A további emelés csak egész licitlépcsőkben történhet. Például 35 000 Ft-os aktuális licit és 1000 Ft-os licitlépcső esetén 36 000, 37 000 vagy 38 000 Ft érvényes.</li>
        <li>A <strong>Lecsapom</strong> gomb a pontos villámárat küldi be. Sikeres művelet esetén a licitáló megnyeri az aukciót, az aukció pedig azonnal lezárul.</li>
        <li>A backend minden licitnél újra ellenőrzi a jogosultságot, az aktuális minimumot, a licitlépcsőt és a villámárat. Ha közben más magasabb ajánlatot tett, magyar hibaüzenet jelzi az új szükséges összeget.</li>
        <li>Bekapcsolt <strong>5 perces szabálynál</strong> az eredeti lejárati idő elérésekor egyszeri +5 perces hosszabbítás indul. Ezalatt továbbra is lehet licitálni, de az idő nem indul újra minden licit után. Az aukció csak a hosszabbítás végén zárul le.</li>
      </ul>
    </section>
    <section className="side-panel rules-panel"><p className="eyebrow">Biztonság és felelősség</p><h2>Piactéri szabályok</h2><p>A felhasználó csak saját tulajdonú, jogszerűen értékesíthető tételt tölthet fel valós leírással és használható képekkel. A moderáció a jelentéseket kivizsgálja; a report önmagában nem bizonyított szabálysértés, és nem okoz automatikus végleges tiltást.</p><p>A Nightfall Vault technikai aukciós piactér. Nem kezel fizetést, rendelést, checkoutot vagy szállítást.</p></section>
  </section>;
}
