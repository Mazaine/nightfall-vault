import { useEffect, useState } from "react";
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from "../api/auth";

const categoryLabels: Record<string, string> = {
  bids: "Licitek", chat: "Chat", follows: "Követések", transactions: "Tranzakciók",
  reviews: "Értékelések", moderation: "Moderáció", system: "Rendszer",
};
const channelLabels = { in_app: "Alkalmazáson belül", browser: "Böngésző", email: "E-mail" } as const;

export function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  const browserSupported = "Notification" in window;
  const browserGranted = browserSupported && Notification.permission === "granted";

  useEffect(() => { getNotificationPreferences().then(setPreferences).catch(() => setMessage("Az értesítési beállítások betöltése nem sikerült.")); }, []);

  async function change(category: string, channel: keyof typeof channelLabels, checked: boolean) {
    if (!preferences || (channel === "browser" && checked && !browserGranted)) return;
    const previous = preferences;
    const next = { categories: { ...preferences.categories, [category]: { ...preferences.categories[category], [channel]: checked } } };
    setPreferences(next);
    setMessage("");
    try { setPreferences(await updateNotificationPreferences(next)); setMessage("Értesítési beállítások mentve."); }
    catch (error) { setPreferences(previous); setMessage(error instanceof Error ? error.message : "A mentés nem sikerült."); }
  }

  async function requestBrowserPermission() {
    if (!browserSupported) { setMessage("Ez a böngésző nem támogatja a rendszerértesítéseket."); return; }
    const permission = await Notification.requestPermission();
    setMessage(permission === "granted" ? "A böngészőértesítések engedélyezve." : "A böngészőértesítésekhez engedély szükséges.");
    if (permission === "granted") setPreferences((value) => value ? { categories: { ...value.categories } } : value);
  }

  return (
    <section className="account-section" aria-labelledby="notification-preferences-title">
      <div className="section-heading"><div><p className="eyebrow">Értesítések</p><h2 id="notification-preferences-title">Értesítési beállítások</h2></div><p className="section-note">Csatornánként és témánként szabályozható.</p></div>
      <div className="side-panel notification-preferences-panel">
        {!preferences && !message ? <p>Beállítások betöltése…</p> : null}
        {preferences ? <div className="notification-matrix" role="group" aria-label="Értesítési csatornák">
          <div className="notification-matrix-head"><strong>Téma</strong>{Object.values(channelLabels).map((label) => <strong key={label}>{label}</strong>)}</div>
          {Object.entries(preferences.categories).map(([category, channels]) => <div className="notification-matrix-row" key={category}><span>{categoryLabels[category] ?? category}</span>{(Object.keys(channelLabels) as (keyof typeof channelLabels)[]).map((channel) => <label key={channel}><span className="visually-hidden">{categoryLabels[category]} – {channelLabels[channel]}</span><input type="checkbox" checked={channels[channel]} disabled={channel === "browser" && !browserGranted} onChange={(event) => void change(category, channel, event.target.checked)} /></label>)}</div>)}
        </div> : null}
        {!browserGranted ? <button className="button button-secondary" type="button" onClick={() => void requestBrowserPermission()} disabled={!browserSupported}>Böngészőértesítések engedélyezése</button> : null}
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      </div>
    </section>
  );
}
