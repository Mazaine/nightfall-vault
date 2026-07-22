import { Link } from "react-router-dom";

export function ContactPage() {
  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim();

  return (
    <section className="container page-shell contact-page" aria-labelledby="contact-title">
      <header className="information-hero">
        <p className="eyebrow">Kapcsolat</p>
        <h1 id="contact-title">Az árnyak között is van iránytű</h1>
        <p>Fiók-, aukciós vagy technikai kérdésnél válaszd a problémához legközelebbi utat.</p>
      </header>
      <div className="support-grid">
        <article><h2>Gyors segítség</h2><p>A licitálás, villámár és az ötpereces szabály részletes leírása egy helyen.</p><Link className="text-link" to="/how-it-works">Hogyan működik?</Link></article>
        <article><h2>Visszaélés jelentése</h2><p>Gyanús aukciónál vagy profilnál használd az adott oldalon található Jelentés gombot, így a moderáció minden szükséges előzményt megkap.</p></article>
        <article><h2>Fiókhelyreállítás</h2><p>Ha nem tudsz belépni, indíts biztonságos jelszó-helyreállítást.</p><Link className="text-link" to="/forgot-password">Elfelejtett jelszó</Link></article>
        <article><h2>Közvetlen támogatás</h2>{supportEmail ? <><p>Írd le röviden a problémát és az érintett aukció vagy fiók azonosítóját. Jelszót soha ne küldj.</p><a className="text-link" href={`mailto:${supportEmail}`}>{supportEmail}</a></> : <p>A zárt béta támogatási címe a meghívóban található. Jelszót vagy más érzékeny adatot ne küldj.</p>}</article>
      </div>
    </section>
  );
}
