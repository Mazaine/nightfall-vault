import { useEffect, useState } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import "./PwaInstallBanner.css";

const MOBILE_BROWSER_QUERY = "(max-width: 760px) and (pointer: coarse)";

export function PwaInstallBanner() {
  const [isMobileBrowser, setIsMobileBrowser] = useState(() => window.matchMedia(MOBILE_BROWSER_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_BROWSER_QUERY);
    const update = () => setIsMobileBrowser(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const { canInstall, dismissForNow, promptInstall } = usePwaInstall();

  if (!canInstall || !isMobileBrowser) return null;

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
