export function ContactPage() {
  return (
    <section className="container page-shell contact-layout">
      <div>
        <p className="eyebrow">Kapcsolat</p>
        <h1>Kérdésed van?</h1>
        <p className="hero-lead">
          Itt később valós ügyfélszolgálati űrlap, email integráció vagy
          jegykezelő modul kapcsolható be.
        </p>
      </div>
      <form className="side-panel contact-form">
        <label>Név<input type="text" placeholder="Teljes név" /></label>
        <label>Email<input type="email" placeholder="email@example.com" /></label>
        <label>Üzenet<textarea rows={5} placeholder="Miben segíthetünk?" /></label>
        <button className="button button-primary" type="submit">Üzenet küldése</button>
      </form>
    </section>
  );
}
