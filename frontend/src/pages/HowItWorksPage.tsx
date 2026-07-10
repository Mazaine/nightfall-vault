export function HowItWorksPage() {
  return (
    <section className="container page-shell">
      <p className="eyebrow">Folyamat</p>
      <h1>Hogyan működik?</h1>
      <div className="info-grid">
        {["Regisztrálj", "Válassz aukciót", "Licitálj biztonságosan", "Vedd át a nyereményt"].map((title, index) => (
          <article className="side-panel info-card" key={title}>
            <span>{index + 1}</span>
            <h2>{title}</h2>
            <p>Áttekinthető, sablonként továbbfejleszthető lépés egy modern webshop vagy aukciós motor számára.</p>
          </article>
        ))}
      </div>
    </section>
  );
}
