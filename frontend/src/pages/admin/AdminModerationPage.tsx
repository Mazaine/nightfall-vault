import { FormEvent, useEffect, useState } from "react";
import { createModerationAction, createUserStrike, getModerationOverview, revokeModerationAction, revokeUserStrike, type ModerationActionType, type ModerationOverview } from "../../api/moderation";
import { formatLocalDateTime } from "../../utils/format";

const actionLabels: Record<ModerationActionType, string> = {
  warning: "Figyelmeztetés", auction_creation_ban: "Aukció-létrehozási tiltás", bidding_ban: "Licitálási tiltás", chat_ban: "Chatküldési tiltás", temporary_ban: "Ideiglenes teljes tiltás", permanent_ban: "Végleges tiltás",
};

export function AdminModerationPage() {
  const [overview, setOverview] = useState<ModerationOverview>({ actions: [], strikes: [] });
  const [message, setMessage] = useState("");
  const [actionType, setActionType] = useState<ModerationActionType>("warning");
  const load = async () => { try { setOverview(await getModerationOverview()); } catch (error) { setMessage(error instanceof Error ? error.message : "A moderációs adatok betöltése nem sikerült."); } };
  useEffect(() => { void load(); }, []);

  const submitAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (["temporary_ban", "permanent_ban"].includes(actionType) && !window.confirm(`Biztosan alkalmazod ezt az intézkedést: ${actionLabels[actionType]}?`)) return;
    try { await createModerationAction({ target_user_id: Number(data.get("target_user_id")), action_type: actionType, reason: String(data.get("reason")), internal_note: String(data.get("internal_note") || ""), expires_at: data.get("expires_at") ? new Date(String(data.get("expires_at"))).toISOString() : null }); form.reset(); setMessage("Az intézkedést rögzítettük."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Az intézkedés nem sikerült."); }
  };
  const submitStrike = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try { await createUserStrike({ target_user_id: Number(data.get("target_user_id")), reason: String(data.get("reason")), severity: String(data.get("severity")), expires_at: data.get("expires_at") ? new Date(String(data.get("expires_at"))).toISOString() : null }); form.reset(); setMessage("A strike-ot rögzítettük."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "A strike rögzítése nem sikerült."); }
  };

  return <section className="admin-page">
    <div className="section-heading page-heading"><div><p className="eyebrow">Trust & Safety</p><h1>Moderáció</h1><p className="section-note">Naplózott figyelmeztetések, strike-ok és célzott korlátozások. A reportszám önmagában nem eredményez tiltást.</p></div></div>
    {message ? <p className="form-message" role="status">{message}</p> : null}
    <div className="moderation-form-grid">
      <form className="side-panel" onSubmit={submitAction}><h2>Intézkedés</h2><label>Felhasználói ID<input name="target_user_id" type="number" min="1" required /></label><label>Típus<select value={actionType} onChange={(event) => setActionType(event.target.value as ModerationActionType)}>{Object.entries(actionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Indok<textarea name="reason" minLength={3} maxLength={1000} required /></label><label>Belső admin megjegyzés<textarea name="internal_note" maxLength={2000} /></label>{actionType !== "warning" && actionType !== "permanent_ban" ? <label>Lejárat<input name="expires_at" type="datetime-local" required /></label> : null}<button className={`button ${actionType === "permanent_ban" ? "button-danger" : "button-primary"}`} type="submit">Intézkedés rögzítése</button></form>
      <form className="side-panel" onSubmit={submitStrike}><h2>Strike kiadása</h2><label>Felhasználói ID<input name="target_user_id" type="number" min="1" required /></label><label>Súlyosság<select name="severity"><option value="low">Alacsony</option><option value="medium">Közepes</option><option value="high">Magas</option><option value="critical">Kritikus</option></select></label><label>Indok<textarea name="reason" minLength={3} maxLength={1000} required /></label><label>Opcionális lejárat<input name="expires_at" type="datetime-local" /></label><button className="button button-primary" type="submit">Strike rögzítése</button></form>
    </div>
    <section><h2>Intézkedési előzmények</h2><div className="moderation-history">{overview.actions.map((action) => <article className="side-panel" key={action.id}><strong>{action.target_user.username} · {actionLabels[action.action_type]}</strong><p>{action.reason}</p><small>Kezdés: {formatLocalDateTime(action.starts_at)}{action.expires_at ? ` · lejárat: ${formatLocalDateTime(action.expires_at)}` : ""}</small><p>{action.revoked_at ? "Visszavonva" : "Aktív vagy előjegyzett"}</p>{!action.revoked_at ? <button className="button button-secondary" type="button" onClick={async () => { if (window.confirm("Visszavonod az intézkedést?")) { await revokeModerationAction(action.id); await load(); } }}>Visszavonás</button> : null}</article>)}</div></section>
    <section><h2>Strike-előzmények</h2><div className="moderation-history">{overview.strikes.map((strike) => <article className="side-panel" key={strike.id}><strong>{strike.user.username} · {strike.severity}</strong><p>{strike.reason}</p><small>Kiadva: {formatLocalDateTime(strike.issued_at)}{strike.expires_at ? ` · lejárat: ${formatLocalDateTime(strike.expires_at)}` : ""}</small><p>{strike.revoked_at ? "Visszavonva" : "Aktív vagy korábbi"}</p>{!strike.revoked_at ? <button className="button button-secondary" type="button" onClick={async () => { if (window.confirm("Visszavonod a strike-ot?")) { await revokeUserStrike(strike.id); await load(); } }}>Visszavonás</button> : null}</article>)}</div></section>
  </section>;
}
