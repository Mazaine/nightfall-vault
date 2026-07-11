const steps = [
  {
    title: "Regisztráció és belépés",
    text: "Aukciót csak bejelentkezett felhasználó hozhat létre. A fiók azonosítja az eladót, és ehhez kötődnek a saját aukciók.",
  },
  {
    title: "Aukció létrehozása",
    text: "Az eladó megadja a címet, leírást, kategóriát, állapotot, kezdőárat, licitlépcsőt, opcionális villámárat, kezdési és zárási időt.",
  },
  {
    title: "Eladói nyilatkozat",
    text: "Az aukció létrehozásakor az eladó elfogadja, hogy jogosult a termék értékesítésére, valós leírást ad, és jogosult a feltöltött képek használatára.",
  },
  {
    title: "Képek és borítókép",
    text: "Aktiváláskor legalább 1, legfeljebb 5 kép szükséges, pontosan 1 borítóképpel. A képeket a backend ellenőrzi és biztonságos néven tárolja.",
  },
  {
    title: "Aktiválás vagy időzítés",
    text: "Ha a kezdési idő már elérkezett, az aukció aktív lesz. Ha jövőbeli kezdést adsz meg, az aukció ütemezett állapotba kerül.",
  },
  {
    title: "Lezárás utáni kapcsolat",
    text: "Privát aukciós chat csak sikeresen lezárt, nyertessel rendelkező aukciónál érhető el, kizárólag az eladó és a nyertes vevő között.",
  },
  {
    title: "Értékelés",
    text: "Sikeresen lezárt aukció után az eladó és a nyertes vevő értékelheti egymást. Önértékelés és duplikált értékelés nem engedélyezett.",
  },
  {
    title: "Piactér szerep",
    text: "A Nightfall Vault technikai piactér-felületet biztosít. Az adásvétel az eladó és a nyertes vevő között jön létre.",
  },
];

const editableFields = [
  "kép",
  "lejárati dátum",
  "5 perces szabály ki/be",
  "villámár ki/be",
  "leírás",
];

const lockedFields = [
  "kezdőár",
  "licitlépcső",
  "már megadott villámár összege",
];

export function HowItWorksPage() {
  return (
    <section className="container page-shell">
      <p className="eyebrow">Folyamat</p>
      <h1>Hogyan működik?</h1>

      <div className="info-grid">
        {steps.map((step, index) => (
          <article className="side-panel info-card" key={step.title}>
            <span>{index + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </div>

      <section className="side-panel rules-panel" aria-labelledby="auction-rules-title">
        <p className="eyebrow">Saját aukciók</p>
        <h2 id="auction-rules-title">Módosítási szabályok</h2>
        <p>
          Aukció létrehozásakor a kezdőár, a licitlépcső és a villámár összege
          végleges üzleti döntésnek számít. Ezek azért nem módosíthatók később,
          mert a résztvevők ezek alapján döntenek a részvételről. A teljes
          licitmotor, licittörténet és automatikus nyertes-meghatározás későbbi
          sprintben készül el.
        </p>

        <div className="rules-grid">
          <div>
            <h3>Módosítható</h3>
            <ul>
              {editableFields.map((field) => <li key={field}>{field}</li>)}
            </ul>
          </div>
          <div>
            <h3>Nem módosítható</h3>
            <ul>
              {lockedFields.map((field) => <li key={field}>{field}</li>)}
            </ul>
          </div>
        </div>

        <p>
          Tiltott vagy jogellenes termék feltöltése nem megengedett. Az admin
          moderáció jogosult aukciót felfüggeszteni, ha a piactér biztonsága,
          jogszerűsége vagy a felhasználók védelme ezt indokolja.
        </p>
      </section>
    </section>
  );
}
