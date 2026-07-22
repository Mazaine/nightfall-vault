import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="container page-shell not-found-page" aria-labelledby="not-found-title">
      <p className="eyebrow">404 · Eltévedtél a homályban</p>
      <h1 id="not-found-title">Ez az oldal nincs a Vaultban</h1>
      <p>A keresett hivatkozás megszűnt, megváltozott, vagy soha nem is vezetett ide.</p>
      <div className="not-found-actions">
        <Link className="button button-primary" to="/">Vissza a főoldalra</Link>
        <Link className="button button-secondary" to="/auctions">Aukciók böngészése</Link>
      </div>
    </section>
  );
}
