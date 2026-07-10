import { Link } from "react-router-dom";

export function CartPage() {
  return (
    <section className="container page-shell split-page">
      <div>
        <p className="eyebrow">Kosár</p>
        <h1>Kosár tartalma</h1>

        <div className="side-panel list-panel">
          <h2>Minta termék</h2>
          <p>1 db prémium termék, később valós kosár API-val összekötve.</p>
          <strong>125.000 Ft</strong>
        </div>
      </div>

      <aside className="side-panel checkout-summary">
        <h2>Összesítő</h2>
        <dl className="detail-list">
          <div><dt>Részösszeg</dt><dd>125.000 Ft</dd></div>
          <div><dt>Szállítás</dt><dd>Később számolva</dd></div>
          <div><dt>Végösszeg</dt><dd>125.000 Ft</dd></div>
        </dl>
        <Link className="button button-primary" to="/checkout">
          Tovább a fizetéshez
        </Link>
      </aside>
    </section>
  );
}
