import { Link } from "react-router-dom";

export function ProductDetailsPage() {
  return (
    <section className="container page-shell detail-layout">
      <div className="detail-media auction-image" aria-hidden="true" />

      <div className="side-panel detail-panel">
        <p className="eyebrow">Termék részletek</p>
        <h1>Prémium termékoldal</h1>
        <p className="hero-lead">
          Általános termék részletező oldal képekkel, leírással, árral,
          készletinformációval és kosár művelettel.
        </p>

        <dl className="detail-list">
          <div><dt>Ár</dt><dd>125.000 Ft</dd></div>
          <div><dt>Készlet</dt><dd>Elérhető</dd></div>
          <div><dt>Kategória</dt><dd>Gyűjtemény</dd></div>
        </dl>

        <div className="hero-actions">
          <Link className="button button-primary" to="/cart">
            Kosárba teszem
          </Link>
          <Link className="button button-ghost" to="/products">
            Vissza a termékekhez
          </Link>
        </div>
      </div>
    </section>
  );
}
