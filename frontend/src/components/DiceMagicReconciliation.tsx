import { useState, type FormEvent } from "react";
import { apiRequest } from "../api/client";

type Hold = { id: number; outer_id: string; quantity: number; baseline_stock: number | null; stock: number | null; generated_at: string | null; snapshot_token: string; resolved_at: string | null; effective_stock: number | null };
type Review = { order_id: number; order_status: string; holds: Hold[] };
export function DiceMagicReconciliation({ orderId }: { orderId: number }) {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/integrations/dicemagic/orders/${orderId}`;
  async function load() { setBusy(true); setError(""); try { setReview(await apiRequest<Review>(base + "/reconciliation")); } catch (e) { setError(e instanceof Error ? e.message : "Az ellenőrzés nem tölthető be."); } finally { setBusy(false); } }
  async function submit(event: FormEvent<HTMLFormElement>, hold: Hold) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { setReview(await apiRequest<Review>(`${base}/holds/${hold.id}/reconcile`, { method: "POST", body: JSON.stringify({ partner_status: form.get("status"), partner_reference: form.get("reference"), verified_stock: hold.stock, snapshot_token: hold.snapshot_token, confirm_verified: form.get("verified") === "on" }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "A készlet nem oldható fel."); }
    finally { setBusy(false); }
  }
  return <section><button className="button button-secondary" disabled={busy} onClick={() => void load()}>Készlet egyeztetése / frissítése</button>{error && <p role="alert">{error}</p>}{review && <><p>Csak a partnerrel ellenőrzött rendelésállapot és rendelés utáni, friss készletsnapshot alapján oldható fel. Ismeretlen kimenetelnél előbb ugyanazt a rendelést próbáld újra.</p>{review.holds.map(hold => <form className="side-panel" key={hold.id} onSubmit={event => void submit(event, hold)}><strong>{hold.outer_id}</strong><p>Megrendelve: {hold.quantity} · Előző készlet: {hold.baseline_stock ?? "nem követett"} · API-készlet: {hold.stock ?? "nem követett"} · Snapshot: {hold.generated_at ?? "ellenőrizendő"}</p>{hold.resolved_at ? <p>Egyeztetve: {hold.resolved_at} · Elérhető: {hold.effective_stock ?? "nem követett"}</p> : <><label>Partnerrel igazolt rendelésállapot<select name="status" defaultValue={review.order_status === "accepted" ? "accepted" : "rejected"}><option value="accepted">API által elfogadva, levonás a boltnál ellenőrizve</option><option value="rejected">Partner igazolta: elutasítva</option><option value="cancelled">Partner igazolta: visszavonva</option></select></label><label>Partneri visszaigazolás / egyeztetés hivatkozása<input name="reference" required minLength={5} maxLength={500} /></label><label><input type="checkbox" name="verified" required /> Ellenőriztem a DiceMagicnél a rendelésállapotot, és a fenti készlet már tartalmazza annak hatását.</label><button className="button button-secondary" disabled={busy || (hold.stock === null && hold.baseline_stock !== null)}>Ellenőrzött blokk feloldása</button></>}</form>)}</>}</section>;
}
