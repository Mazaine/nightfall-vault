export function HomeTrustPanel() {
  return (
    <aside className="side-stack">
      <section className="side-panel">
        <div className="panel-heading">
          <span className="ornament-icon" aria-hidden="true" />
          <h2>Hogyan működik?</h2>
        </div>
        <ol className="steps-list">
          <li>
            <span>1</span>
            <strong>Regisztrálj</strong>
            <p>Hozz létre fiókot pillanatok alatt.</p>
          </li>
          <li>
            <span>2</span>
            <strong>Licitálj</strong>
            <p>Találd meg, amire vágysz, és licitálj rá.</p>
          </li>
          <li>
            <span>3</span>
            <strong>Nyerd meg</strong>
            <p>Egyeztess az eladóval, és zárjátok le egymás között az adásvételt.</p>
          </li>
        </ol>
      </section>

      <section className="side-panel trust-panel">
        <h2>Biztonság és megbízhatóság</h2>
        <ul>
          <li>Ellenőrzött eladók</li>
          <li>Átlátható licitálás</li>
          <li>Gyors ügyfélszolgálat</li>
        </ul>
      </section>
    </aside>
  );
}
