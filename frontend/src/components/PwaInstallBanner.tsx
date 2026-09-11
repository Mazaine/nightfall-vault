import { usePwaInstall } from "../hooks/usePwaInstall";
import "./PwaInstallBanner.css";

export function PwaInstallBanner() {
  const { canInstall, dismissForNow, promptInstall } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <aside className="pwa-install-banner" aria-labelledby="pwa-install-title" aria-describedby="pwa-install-description">
      <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
      <div className="pwa-install-copy">
        <strong id="pwa-install-title">Nightfall Vault a telefonodon</strong>
        <span id="pwa-install-description">Telepítsd az alkalmazást, és érd el gyorsabban az aukcióidat.</span>
      </div>
      <div className="pwa-install-actions">
        <button className="button button-primary" type="button" onClick={() => void promptInstall()}>Telepítés</button>
        <button className="button button-ghost" type="button" onClick={dismissForNow}>Most nem</button>
      </div>
    </aside>
  );
}
