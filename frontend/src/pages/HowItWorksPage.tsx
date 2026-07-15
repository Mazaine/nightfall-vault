const steps = [
  ["Regisztráció és belépés", "Aukciót és licitet csak aktív, ellenőrzött fiókkal lehet létrehozni."],
  ["Aukció létrehozása", "Az eladó megadja a leírást, képeket, állapotot, kezdőárat, licitlépcsőt és az időzítést."],
  ["Licitálás", "Az aktív aukción a backend ellenőrzi a minimum licitet, a jogosultságot, a villámárat és az ötperces hosszabbítást."],
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
    <section className="side-panel rules-panel"><p className="eyebrow">Biztonság és felelősség</p><h2>Piactéri szabályok</h2><p>A felhasználó csak saját tulajdonú, jogszerűen értékesíthető tételt tölthet fel valós leírással és használható képekkel. A moderáció a jelentéseket kivizsgálja; a report önmagában nem bizonyított szabálysértés, és nem okoz automatikus végleges tiltást.</p><p>A Nightfall Vault technikai aukciós piactér. Nem kezel fizetést, rendelést, checkoutot vagy szállítást.</p></section>
  </section>;
}
