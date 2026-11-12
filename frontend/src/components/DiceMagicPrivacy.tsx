import { useState } from "react";
import { apiRequest } from "../api/client";

type Preview = { policy_approved: boolean; retention_days: number | null; items: Array<{ id: number; status: string; token: string }> };
const base = "/api/admin/integrations/dicemagic/privacy";

export function DiceMagicPrivacy() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setBusy(true); setMessage(""); setConfirmed(false);
    try { setPreview(await apiRequest<Preview>(base + "/preview")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Az előnézet nem tölthető be."); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || !confirmed) return;
    setBusy(true); setMessage("");
    try {
      const result = await apiRequest<{ anonymized_count: number }>(base + "/anonymize", { method: "POST", body: JSON.stringify({ expected: Object.fromEntries(preview.items.map(item => [item.id, item.token])), confirmed }) });
      setMessage(`${result.anonymized_count} rendelés személyes adatai eltávolítva.`);
      setPreview(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Az anonimizálás sikertelen."); }
    finally { setBusy(false); setConfirmed(false); }
  }
  return <details className="side-panel"><summary>Bolti rendelési adatok megőrzése</summary>
    <p>Csak a lezárt, készlet szempontjából is egyeztetett saját rendelések személyes adatai távolíthatók el. A tételek, összegek és ügyletek megmaradnak.</p>
    <button className="button button-secondary" disabled={busy} onClick={() => void load()}>Anonimizálási előnézet</button>
    {message && <p role="status">{message}</p>}
    {preview && <>
      {!preview.policy_approved || !preview.retention_days ? <p>Az adattörlés tiltott: nincs jóváhagyott és konfigurált adatmegőrzési szabályzat.</p> : <p>Megőrzés: {preview.retention_days} nap a lezárástól, illetve az utolsó ügylet- vagy felülvizsgálati határidőtől.</p>}
      <p>{preview.items.length} rendelés az előnézetben (legfeljebb 100).</p>
      <ul>{preview.items.map(item => <li key={item.id}>#{item.id} · {item.status}</li>)}</ul>
      {preview.policy_approved && preview.retention_days && preview.items.length > 0 ? <>
        <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Ellenőriztem, hogy nincs nyitott jogvita vagy külön megőrzési kötelezettség, és jóváhagyom a felsorolt rendelések név-, cím-, elérhetőségi és megjegyzésadatainak végleges eltávolítását.</label>
        <button className="button button-secondary" disabled={busy || !confirmed} onClick={() => void apply()}>Személyes adatok végleges eltávolítása</button>
      </> : null}
    </>}
  </details>;
}
