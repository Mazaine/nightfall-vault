import { useEffect, useState } from "react";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../api/auth";

const preferenceLabels: [keyof NotificationPreferences, string][] = [
  ["notify_in_app", "Alkalmazason beluli ertesitesek"],
  ["notify_email_outbid", "E-mail, ha rád licitálnak"],
  ["notify_email_auction_result", "Email aukcio eredmenyrol"],
  ["notify_email_moderation", "Email moderacios esemenyrol"],
];

export function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getNotificationPreferences()
      .then(setPreferences)
      .catch(() => setMessage("Az értesítési beállítások betöltése nem sikerült."));
  }, []);

  const changePreference = async (key: keyof NotificationPreferences, checked: boolean) => {
    if (!preferences) {
      return;
    }
    const previousPreferences = preferences;
    const nextPreferences = { ...preferences, [key]: checked };
    setPreferences(nextPreferences);
    setMessage("");
    try {
      const saved = await updateNotificationPreferences(nextPreferences);
      setPreferences(saved);
      setMessage("Értesítési beállítások mentve.");
    } catch (error) {
      setPreferences(previousPreferences);
      setMessage(error instanceof Error ? error.message : "Az értesítési beállítások mentése nem sikerült.");
    }
  };

  return (
    <section className="account-section" aria-labelledby="notification-preferences-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Értesítések</p>
          <h2 id="notification-preferences-title">Értesítési beállítások</h2>
        </div>
        <p className="section-note">Az email kuldes kulon uzemeltetoi engedelyezest igenyel.</p>
      </div>
      <div className="side-panel notification-preferences-panel">
        {!preferences && !message ? <p>Beállítások betöltése…</p> : null}
        {preferences ? (
          <div className="rules-grid">
            {preferenceLabels.map(([key, label]) => (
              <label className="toggle-row" key={key}>
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={(event) => changePreference(key, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
      </div>
    </section>
  );
}
