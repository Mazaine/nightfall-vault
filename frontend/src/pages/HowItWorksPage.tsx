const steps = [
  {
    title: "Regisztrálj",
    text: "Hozz létre fiókot, hogy licitálni tudj, követhesd a saját licitjeidet, és aukciót tölthess fel.",
  },
  {
    title: "Válassz aukciót",
    text: "Nyisd meg az aukció részleteit, ellenőrizd az eladót, az értékelést, az állapotot és a licitlépcsőt.",
  },
  {
    title: "Licitálj vagy csapj le rá",
    text: "Normál licitnél a megadott licitlépcső szerint emelhetsz. Ha van villámár, a sárga villám gombbal azonnal megveheted.",
  },
  {
    title: "Kövesd a Licitjeim oldalon",
    text: "A Licitjeim oldalon gyorsan megtalálod azokat az aukciókat, amelyekre licitáltál, és látod, ha valaki rád licitált.",
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
          végleges döntésnek számít. Ezek azért nem módosíthatók később, mert a
          licitálók ezek alapján döntenek a részvételről.
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
          A lezárt aukciók 24 óráig még láthatók elszürkítve, hogy legyen időd
          ellenőrizni az eredményt. Ezután automatikusan eltűnnek a listákból.
        </p>
      </section>
    </section>
  );
}
