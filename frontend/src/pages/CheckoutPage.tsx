export function CheckoutPage() {
  return (
    <section className="container page-shell split-page">
      <div>
        <p className="eyebrow">Checkout</p>
        <h1>Fizetés és szállítás</h1>

        <form className="side-panel contact-form">
          <label>
            Név
            <input type="text" placeholder="Teljes név" />
          </label>
          <label>
            Email
            <input type="email" placeholder="email@example.com" />
          </label>
          <label>
            Szállítási cím
            <input type="text" placeholder="Város, utca, házszám" />
          </label>
          <button className="button button-primary" type="submit">
            Rendelés leadása
          </button>
        </form>
      </div>

      <aside className="side-panel checkout-summary">
        <h2>Rendelés összesítő</h2>
        <p>
          Ez a sablon checkout oldal később fizetési szolgáltatóval és backend
          rendelés API-val kapcsolható össze.
        </p>
      </aside>
    </section>
  );
}
