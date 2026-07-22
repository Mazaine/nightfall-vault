import { Link } from "react-router-dom";

export function HomeHero() {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true" />
      <div className="container hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">Nightfall Vault</p>
          <h1 id="hero-title">
            <span>Lépj be a</span>
            <span>sötétség piacára</span>
          </h1>
          <p className="hero-lead">
            Prémium aukciós platform ritka tárgyakhoz, ellenőrzött eladókhoz
            és tiszta, modern licitálási élményhez.
          </p>
          <div className="hero-actions" aria-label="Elsődleges műveletek">
            <Link className="button button-primary" to="/auctions">
              Aukciók felfedezése
            </Link>
            <Link className="button button-ghost" to="/how-it-works">
              Hogyan működik?
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
