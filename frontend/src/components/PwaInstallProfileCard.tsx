import { usePwaInstall } from "../hooks/usePwaInstall";

export function PwaInstallProfileCard() {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  return (
    <section className="side-panel profile-settings-card pwa-profile-card" aria-labelledby="pwa-profile-title">
      <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
      <div className="pwa-profile-copy">
        <h2 id="pwa-profile-title">Mobilalkalmazás</h2>
        <p>Telepítsd a Nightfall Vaultot a kezdőképernyődre, hogy gyorsabban elérd az aukcióidat és a telefonos értesítéseket.</p>
        {isInstalled ? <p className="status-badge status-active">Telepítve ezen az eszközön</p> : null}
        {!isInstalled && !canInstall ? <p className="section-note">Ha a telepítőgomb nem érhető el, Android Chrome-ban nyisd meg a böngésző menüjét, majd válaszd az „Alkalmazás telepítése” vagy a „Hozzáadás a kezdőképernyőhöz” lehetőséget.</p> : null}
      </div>
      {canInstall ? <button className="button button-primary" type="button" onClick={() => void promptInstall()}>Mobilalkalmazás telepítése</button> : null}
    </section>
  );
}
