import { useEffect, useState } from "react";
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from "../api/auth";
import { formatLocalDateTime } from "../utils/format";
import {
  announceWebPushState,
  disableWebPush,
  enableWebPush,
  getWebPushDeviceStatus,
  getWebPushSupport,
  isInstalledAppDisplayMode,
  testWebPush,
  type WebPushDeviceStatus,
} from "../utils/webPush";

const eventLabels: Record<string, string> = {
  outbid: "Rám licitáltak",
  auction_bid_received: "Új licit érkezett a saját aukciómra",
  auction_won: "Megnyertem az aukciót",
  auction_lost: "Nem én nyertem az aukciót",
  auction_sold: "Sikeresen lezárult a saját aukcióm",
  auction_unsold: "A saját aukcióm eladatlanul zárult",
  watchlist_reminder: "Figyelt aukció hamarosan lejár",
  seller_auction_reminder: "Saját aukcióm hamarosan lejár",
  transaction_updates: "Tranzakcióval kapcsolatos értesítés",
  auction_message: "Új tranzakciós chatüzenet",
  seller_new_auction: "Követett eladó új aukciója",
  review_received: "Új értékelés érkezett",
  bid_updates: "Licit visszavonása vagy licitvezető-változás",
  moderation: "Moderációs értesítés",
  system: "Egyéb rendszerértesítés",
};

const statusLabels: Record<WebPushDeviceStatus["state"], string> = {
  not_supported: "Nem támogatott",
  permission_denied: "Böngészőengedély tiltva",
  unsubscribed: "Nincs feliratkozva",
  active: "Aktív",
  needs_resubscribe: "Hibás – újrafeliratkozás szükséges",
};

function initialPushStatus(): WebPushDeviceStatus {
  const support = getWebPushSupport();
  if (!support.supported) return { state: "not_supported", active: false, lastSuccessAt: null };
  if (window.Notification.permission === "denied") return { state: "permission_denied", active: false, lastSuccessAt: null };
  return { state: "unsubscribed", active: false, lastSuccessAt: null };
}

export function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushStatus, setPushStatus] = useState<WebPushDeviceStatus>(initialPushStatus);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupport = getWebPushSupport();
  const pushActive = pushStatus.state === "active";

  useEffect(() => {
    getNotificationPreferences().then(setPreferences).catch(() => setMessage("Az értesítési beállítások betöltése nem sikerült."));
    if (pushSupport.supported) {
      getWebPushDeviceStatus().then(setPushStatus).catch(() => setPushStatus({ state: "needs_resubscribe", active: false, lastSuccessAt: null }));
    }
  }, [pushSupport.supported]);

  async function change(eventKey: string, channel: "email" | "push", checked: boolean) {
    if (!preferences || (channel === "push" && checked && !pushActive)) return;
    const previous = preferences;
    const next = { ...preferences, categories: { ...preferences.categories, [eventKey]: { ...preferences.categories[eventKey], [channel]: checked } } };
    setPreferences(next);
    setMessage("");
    try { setPreferences(await updateNotificationPreferences(next)); setMessage("Értesítési beállítások mentve."); }
    catch (error) { setPreferences(previous); setMessage(error instanceof Error ? error.message : "A mentés nem sikerült."); }
  }

  async function toggleWebPush() {
    setPushBusy(true);
    setPushMessage("");
    try {
      if (pushActive) {
        await disableWebPush();
        setPushStatus({ state: "unsubscribed", active: false, lastSuccessAt: pushStatus.lastSuccessAt });
        announceWebPushState(false);
        setPushMessage("A telefonos push feliratkozás kikapcsolva ezen az eszközön.");
      } else {
        const result = await enableWebPush();
        const verified = await getWebPushDeviceStatus();
        setPushStatus(verified);
        announceWebPushState(true);
        let preferenceWarning = "";
        if (preferences?.push_defaults_eligible && isInstalledAppDisplayMode()) {
          const enabledPreferences = {
            categories: Object.fromEntries(Object.entries(preferences.categories).map(([key, channels]) => [key, { ...channels, push: true }])),
            push_defaults_eligible: false,
          };
          try { setPreferences(await updateNotificationPreferences(enabledPreferences)); }
          catch { preferenceWarning = " Az események automatikus bekapcsolása nem sikerült; kapcsold be őket kézzel."; }
        }
        setPushMessage(`${result.alreadySubscribed ? "A meglévő eszközfeliratkozás frissítve." : "A telefonos push feliratkozás elkészült ezen az eszközön."}${preferenceWarning}`);
      }
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "A telefonos push beállítása nem sikerült.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTest() {
    setPushBusy(true);
    setPushMessage("");
    try {
      const result = await testWebPush();
      setPushStatus({ state: "active", active: true, lastSuccessAt: result.lastSuccessAt });
      setPushMessage("A tesztértesítést sikeresen elküldtük erre az eszközre.");
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "A tesztértesítés küldése nem sikerült.");
      try { setPushStatus(await getWebPushDeviceStatus()); } catch { setPushStatus((value) => ({ ...value, state: "needs_resubscribe", active: false })); }
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <section className="account-section" aria-labelledby="notification-preferences-title">
      <div className="section-heading"><div><p className="eyebrow">Értesítések</p><h2 id="notification-preferences-title">Értesítési beállítások</h2></div><p className="section-note">Eseményenként külön választható az e-mail és a telefonos push.</p></div>
      <div className="side-panel notification-preferences-panel">
        {!preferences && !message ? <p>Beállítások betöltése…</p> : null}
        {preferences ? <div className="notification-matrix" role="group" aria-label="Értesítési események">
          <div className="notification-matrix-head"><strong>Esemény</strong><strong>E-mail</strong><strong>Telefonos push</strong></div>
          {Object.entries(preferences.categories).map(([eventKey, channels]) => <div className="notification-matrix-row" key={eventKey}>
            <span>{eventLabels[eventKey] ?? eventKey}</span>
            <label><span className="visually-hidden">{eventLabels[eventKey]} – E-mail</span><input type="checkbox" checked={channels.email} onChange={(event) => void change(eventKey, "email", event.target.checked)} /></label>
            <label><span className="visually-hidden">{eventLabels[eventKey]} – Telefonos push</span><input type="checkbox" checked={channels.push} disabled={!pushActive} onChange={(event) => void change(eventKey, "push", event.target.checked)} /></label>
          </div>)}
        </div> : null}
        <p className="section-note">A fiókbiztonsági e-mailek – például a jelszó-visszaállítás és az e-mail-cím ellenőrzése – ettől függetlenül mindig engedélyezettek.</p>
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      </div>
      <div className="side-panel web-push-settings" aria-labelledby="web-push-title">
        <div><h3 id="web-push-title">Telefonos push ezen az eszközön</h3><p>Az értesítés akkor is megjelenhet, amikor a Nightfall Vault nincs megnyitva. A kézbesítést az Android energiatakarékossága és a böngésző beállításai befolyásolhatják.</p></div>
        <p className={pushActive ? "status-badge status-active" : pushStatus.state === "needs_resubscribe" ? "status-badge status-error" : "status-badge"}>{statusLabels[pushStatus.state]}</p>
        {pushStatus.lastSuccessAt ? <p>Utolsó sikeres push: <strong>{formatLocalDateTime(pushStatus.lastSuccessAt)}</strong></p> : null}
        <div className="web-push-actions">
          <button className={pushActive ? "button button-secondary" : "button button-primary"} type="button" onClick={() => void toggleWebPush()} disabled={!pushSupport.supported || pushStatus.state === "permission_denied" || pushBusy}>
            {pushBusy ? "Folyamatban…" : pushActive ? "Kikapcsolás ezen az eszközön" : pushStatus.state === "needs_resubscribe" ? "Újrafeliratkozás ezen az eszközön" : "Bekapcsolás ezen az eszközön"}
          </button>
          <button className="button button-secondary" type="button" onClick={() => void sendTest()} disabled={!pushActive || pushBusy}>Tesztértesítés küldése erre az eszközre</button>
        </div>
        {!pushSupport.supported ? <p className="form-message">{pushSupport.reason}</p> : null}
        {pushStatus.state === "permission_denied" ? <p className="form-message">Az értesítési engedélyt a böngésző webhelybeállításaiban lehet újra engedélyezni.</p> : null}
        {pushStatus.state === "needs_resubscribe" ? <p className="form-message">A böngészőben még látható feliratkozás már nem aktív a szerveren. Iratkozz fel újra.</p> : null}
        {pushMessage ? <p className="form-message" aria-live="polite">{pushMessage}</p> : null}
      </div>
    </section>
  );
}
