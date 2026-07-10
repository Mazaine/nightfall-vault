import { Link } from "react-router-dom";
import { activeAuctions } from "../../data/content";

export function HomeHero() {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true" />
      <div className="container hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">Nightfall Vault</p>
          <h1 id="hero-title">Lépj be a sötétség piacára</h1>
          <p className="hero-lead">
            Prémium aukciós webshop ritka tárgyakhoz, ellenőrzött eladókhoz
            és tiszta, modern licitálási élményhez.
          </p>
          <div className="hero-actions" aria-label="Elsodleges muveletek">
            <Link className="button button-primary" to="/auctions">
              Aukciók felfedezése
            </Link>
            <Link className="button button-ghost" to="/how-it-works">
              Hogyan működik?
            </Link>
          </div>
        </div>

        <aside className="side-panel active-panel" aria-label="Aktív aukciók">
          <div className="panel-heading">
            <span className="ornament-icon" aria-hidden="true" />
            <h2>Aktív aukciók</h2>
          </div>
          <div className="active-list">
            {activeAuctions.map(([name, price, time]) => (
              <article className="active-item" key={name}>
                <div className="active-thumb" aria-hidden="true" />
                <div>
                  <h3>{name}</h3>
                  <p>Jelenlegi licit: <strong>{price}</strong></p>
                  <time>{time}</time>
                </div>
              </article>
            ))}
          </div>
          <Link className="text-link" to="/auctions">
            Összes aktív aukció
          </Link>
        </aside>
      </div>
    </section>
  );
}
