export function HomeTrustPanel() {
  return (
    <aside className="side-stack">
      <section className="side-panel trust-panel">
        <h2>Biztonság és megbízhatóság</h2>
        <ul>
          <li className="trust-tooltip" tabIndex={0}>Megerősített fiókok<span role="tooltip">Az e-mail-hitelesítés, a publikus értékelések és a lezárt ügyletek előzménye segíti a döntést.</span></li>
          <li className="trust-tooltip" tabIndex={0}>Átlátható licitálás<span role="tooltip">Az aktuális ár, a licitlépcső, a licitszám és a saját licitállapot valós időben követhető.</span></li>
          <li className="trust-tooltip" tabIndex={0}>Közösségi visszajelzések<span role="tooltip">A kölcsönösen lezárt ügyletek után adott kötelező értékelések mutatják a felhasználói elégedettséget.</span></li>
          <li className="trust-tooltip" tabIndex={0}>Moderált piactér<span role="tooltip">Az aukció- és profiljelentések, a blokkolás, valamint az adminisztrátori audit segíti a visszaélések kezelését.</span></li>
        </ul>
      </section>
    </aside>
  );
}
