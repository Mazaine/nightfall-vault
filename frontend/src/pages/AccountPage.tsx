import { Link } from "react-router-dom";

export function AccountPage() {
  return (
    <section className="container page-shell">
      <p className="eyebrow">Fiók</p>
      <h1>Saját fiók</h1>

      <div className="info-grid">
        <Link className="side-panel info-card" to="/orders">
          <span>1</span>
          <h2>Rendelések</h2>
          <p>Korábbi rendelések és státuszok.</p>
        </Link>

        <article className="side-panel info-card">
          <span>2</span>
          <h2>Profiladatok</h2>
          <p>Név, email és számlázási adatok kezelése.</p>
        </article>

        <article className="side-panel info-card">
          <span>3</span>
          <h2>Biztonság</h2>
          <p>Jelszó és fiókvédelmi beállítások.</p>
        </article>
      </div>
    </section>
  );
}
