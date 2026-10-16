import { Link } from "react-router";

export function HomeHero() {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true" />
      <div className="container hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">Nightfall Vault</p>
          <h1 id="hero-title">
            <span>A HKK-lapok</span>
            <span>új otthona</span>
          </h1>
          <p className="hero-lead">
            Gyűjts, cserélj, vásárolj és licitálj egy helyen! Rendszerezd lapjaidat a Virtuális HKK Mappában, fedezd fel más gyűjtők ajánlatait, vagy hirdesd meg saját kártyáidat.
          </p>
          <div className="hero-actions" aria-label="Elsődleges műveletek">
            <Link className="button button-primary" to="/marketplace">
              Piactér felfedezése
            </Link>
            <Link className="button button-secondary" to="/vault">
              Virtuális mappám
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
