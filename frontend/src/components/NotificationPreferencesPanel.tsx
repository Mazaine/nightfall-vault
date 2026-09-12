import { useEffect, useState } from "react";
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from "../api/auth";
import { announceWebPushState, disableWebPush, enableWebPush, getWebPushSupport, isInstalledAppDisplayMode, isWebPushActiveForCurrentUser } from "../utils/webPush";

const categoryLabels: Record<string, string> = {
  bids: "Licitek", chat: "Chat", follows: "Követések", transactions: "Tranzakciók",
  reviews: "Értékelések", moderation: "Moderáció", system: "Rendszer",
};
const channelLabels = { in_app: "Alkalmazáson belüli értesítés", browser: "Értesítés megnyitott alkalmazásnál", push: "Telefonos push értesítés", email: "E-mail" } as const;

export function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushActive, setPushActive] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupport = getWebPushSupport();
  const browserSupported = typeof window.Notification !== "undefined";
  const browserGranted = browserSupported && window.Notification.permission === "granted";
  const pushPermission = browserSupported ? window.Notification.permission : "unsupported";
  const pushPermissionLabel = pushPermission === "granted" ? "Engedélyezett" : pushPermission === "denied" ? "Tiltott" : pushPermission === "default" ? "Még nincs eldöntve" : "Nem támogatott";

  useEffect(() => {
    getNotificationPreferences().then(setPreferences).catch(() => setMessage("Az értesítési beállítások betöltése nem sikerült."));
    if (pushSupport.supported) {
      isWebPushActiveForCurrentUser().then(setPushActive).catch(() => setPushMessage("A push feliratkozás állapota nem olvasható."));
    }
  }, [pushSupport.supported]);

  async function change(category: string, channel: keyof typeof channelLabels, checked: boolean) {
    if (!preferences || (channel === "browser" && checked && !browserGranted) || (channel === "push" && checked && !pushActive)) return;
    const previous = preferences;
    const next = { categories: { ...preferences.categories, [category]: { ...preferences.categories[category], [channel]: checked } } };
    setPreferences(next);
    setMessage("");
    try { setPreferences(await updateNotificationPreferences(next)); setMessage("Értesítési beállítások mentve."); }
    catch (error) { setPreferences(previous); setMessage(error instanceof Error ? error.message : "A mentés nem sikerült."); }
  }

  async function requestBrowserPermission() {
    if (!browserSupported) { setMessage("Ez a böngésző nem támogatja a rendszerértesítéseket."); return; }
    const permission = await window.Notification.requestPermission();
    setMessage(permission === "granted" ? "A megnyitott alkalmazás értesítései engedélyezve." : "Ehhez a csatornához böngészőengedély szükséges.");
    if (permission === "granted") setPreferences((value) => value ? { categories: { ...value.categories } } : value);
  }

  async function toggleWebPush() {
    setPushBusy(true);
    setPushMessage("");
    try {
      if (pushActive) {
        await disableWebPush();
        setPushActive(false);
        announceWebPushState(false);
        setPushMessage("A telefonos push feliratkozás kikapcsolva ezen az eszközön.");
      } else {
        const result = await enableWebPush();
        setPushActive(true);
        announceWebPushState(true);
        let preferenceWarning = "";
        if (preferences && isInstalledAppDisplayMode()) {
          const enabledPreferences = {
            categories: Object.fromEntries(Object.entries(preferences.categories).map(([category, channels]) => [category, { ...channels, push: true }])),
          } as NotificationPreferences;
          try {
            setPreferences(await updateNotificationPreferences(enabledPreferences));
          } catch {
            preferenceWarning = " A kategóriák automatikus bekapcsolása nem sikerült; próbáld meg őket kézzel engedélyezni.";
          }
        }
        setPushMessage(`${result.alreadySubscribed ? "A meglévő eszközfeliratkozás frissítve." : "A telefonos push feliratkozás elkészült ezen az eszközön."}${preferenceWarning}`);
      }
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "A telefonos push beállítása nem sikerült.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <section className="account-section" aria-labelledby="notification-preferences-title">
      <div className="section-heading"><div><p className="eyebrow">Értesítések</p><h2 id="notification-preferences-title">Értesítési beállítások</h2></div><p className="section-note">Csatornánként és témánként szabályozható.</p></div>
      <div className="side-panel notification-preferences-panel">
        {!preferences && !message ? <p>Beállítások betöltése…</p> : null}
        {preferences ? <div className="notification-matrix" role="group" aria-label="Értesítési csatornák">
          <div className="notification-matrix-head"><strong>Téma</strong>{Object.values(channelLabels).map((label) => <strong key={label}>{label}</strong>)}</div>
          {Object.entries(preferences.categories).map(([category, channels]) => <div className="notification-matrix-row" key={category}><span>{categoryLabels[category] ?? category}</span>{(Object.keys(channelLabels) as (keyof typeof channelLabels)[]).map((channel) => <label key={channel}><span className="visually-hidden">{categoryLabels[category]} – {channelLabels[channel]}</span><input type="checkbox" checked={channels[channel]} disabled={(channel === "browser" && !browserGranted) || (channel === "push" && !pushActive)} onChange={(event) => void change(category, channel, event.target.checked)} /></label>)}</div>)}
        </div> : null}
        {!browserGranted ? <button className="button button-secondary" type="button" onClick={() => void requestBrowserPermission()} disabled={!browserSupported}>Megnyitott alkalmazás értesítéseinek engedélyezése</button> : null}
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      </div>
      <div className="side-panel web-push-settings" aria-labelledby="web-push-title">
        <div><h3 id="web-push-title">Telefonos push ezen az eszközön</h3><p>Az értesítés akkor is megjelenhet, amikor a Nightfall Vault nincs megnyitva. A kézbesítést az Android energiatakarékossága és a böngésző beállításai befolyásolhatják.</p></div>
        <p className={pushActive ? "status-badge status-active" : "status-badge"}>{pushActive ? "Feliratkozva" : "Nincs feliratkozva"}</p>
        <p>Böngészőengedély: <strong>{pushPermissionLabel}</strong></p>
        <p>Eszköztámogatás: <strong>{pushSupport.supported ? "Támogatott" : "Nem támogatott"}</strong></p>
        <button className={pushActive ? "button button-secondary" : "button button-primary"} type="button" onClick={() => void toggleWebPush()} disabled={!pushSupport.supported || pushPermission === "denied" || pushBusy}>
          {pushBusy ? "Folyamatban…" : pushActive ? "Kikapcsolás ezen az eszközön" : "Bekapcsolás ezen az eszközön"}
        </button>
        {!pushSupport.supported ? <p className="form-message">{pushSupport.reason}</p> : null}
        {pushPermission === "denied" ? <p className="form-message">Az értesítési engedélyt a böngésző webhelybeállításaiban lehet újra engedélyezni.</p> : null}
        {pushMessage ? <p className="form-message" aria-live="polite">{pushMessage}</p> : null}
      </div>
    </section>
  );
}
