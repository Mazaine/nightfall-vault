import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiRequest } from "../../api/client";
import type { ShopOrder } from "../../api/cart";
import { DiceMagicReconciliation } from "../../components/DiceMagicReconciliation";
import { DiceMagicPrivacy } from "../../components/DiceMagicPrivacy";
import { formatMoney } from "../../utils/format";

const base = "/api/admin/integrations/dicemagic";
type Status = { visibility: "admin_only" | "public"; enabled: boolean; client_id_configured: boolean; secret_configured: boolean; sync_enabled: boolean; orders_enabled: boolean; order_environment_enabled: boolean; last_sync_at: string | null; last_error: string | null; summary: Record<string, number> };
const statuses: Record<string, string> = { queued: "Külön küldésre vár", sending: "Küldés folyamatban", accepted: "A partner elfogadta; fizetés és átvétel egyeztetendő", unknown: "Bizonytalan eredmény", rejected: "Elutasítva", cancelled: "Partnerrel egyeztetve visszavonva" };

export function AdminDiceMagicPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState<ShopOrder | null>(null);
  const [sendConfirmed, setSendConfirmed] = useState(false);
  const load = async () => { setStatus(await apiRequest<Status>(base)); setOrders(await apiRequest<ShopOrder[]>(base + "/orders")); };
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, []);
  async function action(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    try {
      const result = await apiRequest<{ status?: string }>(base + path, { method, body: body ? JSON.stringify(body) : undefined });
      setMessage(result.status ? statuses[result.status] || result.status : "A művelet lefutott.");
      setReview(null); setSendConfirmed(false); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Hiba történt."); }
    finally { setBusy(false); }
  }
  return <section className="side-panel">
    <h1>Integrációk · DiceMagic</h1><p>DiceMagic láthatóság: {status?.visibility === "public" ? "Nyilvános – mindenki számára" : "Csak admin"}</p>
    {message && <p role="status">{message}</p>}
    {status && <>
      <p>Integráció: {status.enabled ? "bekapcsolva" : "kikapcsolva"} · Client ID: {status.client_id_configured ? "beállítva" : "hiányzik"} · Secret: {status.secret_configured ? "beállítva" : "hiányzik"}</p>
      <p>Utolsó szinkron: {status.last_sync_at || "még nem történt"} · Hiba: {status.last_error || "nincs"}</p>
      <dl>{Object.entries(status.summary).map(([key, count]) => <div key={key}><dt>{key}</dt><dd>{count}</dd></div>)}</dl>
      <button className="button button-secondary" disabled={busy} onClick={() => void action("/connection")}>Kapcsolat ellenőrzése</button>{" "}
      <button className="button button-secondary" disabled={busy} onClick={() => void action("/sync")}>Szinkronizálás most</button>
      <p><label><input type="checkbox" checked={status.sync_enabled} disabled={busy} onChange={e => void action("/controls", { sync_enabled: e.target.checked, orders_enabled: status.orders_enabled, confirm_real_orders: status.orders_enabled }, "PUT")} /> Automatikus szinkron</label></p>
      <p>A rendelésküldési API-jogosultság előzetesen nem ellenőrizhető. Környezeti engedély: {status.order_environment_enabled ? "igen" : "nem"}.</p>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Megértettem: az engedélyezett rendelésküldés valódi DiceMagic-rendelést hoz létre.</label>
      <p><button className="button button-secondary" disabled={busy || (!status.orders_enabled && !confirmed)} onClick={() => void action("/controls", { sync_enabled: status.sync_enabled, orders_enabled: !status.orders_enabled, confirm_real_orders: confirmed }, "PUT")}>{status.orders_enabled ? "Rendelésküldés letiltása" : "Valódi DiceMagic-rendelések engedélyezése"}</button></p>
    </>}
    <h2>Bolti rendelések</h2>
    <DiceMagicPrivacy />
    <button className="button button-secondary" disabled={busy} onClick={() => void load().catch(e => setMessage(e.message))}>Rendelések frissítése</button>
    {orders.map(order => <article className="side-panel" key={order.id}>
      <strong>{order.external_order_id}</strong><p>{statuses[order.status] || order.status} · {formatMoney(order.total)} · {order.shop_order_id || "nincs bolti visszaigazolás"}{order.error ? " · " + order.error : ""}</p>
      <ul>{order.items.map(item => <li key={item.outer_id}>{item.name} · {item.quantity} db × {formatMoney(item.unit_price_huf)} = {formatMoney(item.line_total_huf)}</li>)}</ul>
      {order.transaction_id && <Link to="/account/transactions">Ügylet és közös egyeztetés</Link>}
      {["queued", "unknown", "sending"].includes(order.status) && <button className="button button-secondary" disabled={busy || !status?.orders_enabled || !status.order_environment_enabled} onClick={() => { setReview(order); setSendConfirmed(false); }}>Rendelés ellenőrzése és külön elküldése</button>}
      <DiceMagicReconciliation orderId={order.id} />
    </article>)}
    {review && <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dm-send-title">
      <h2 id="dm-send-title">Valódi DiceMagic-rendelés elküldése</h2><p>{review.external_order_id}</p>
      <ul>{review.items.map(item => <li key={item.outer_id}>{item.name} · {item.quantity} db · {formatMoney(item.line_total_huf)}</li>)}</ul>
      <strong>Termékösszeg: {formatMoney(review.total)}</strong><p>A DiceMagic valódi rendelést kap, e-mailt küldhet és készletet vonhat le. Az átutalást és a szállítás díját a bolttal kell egyeztetni. Újrapróbáláskor az eredeti azonosító és tartalom kerül elküldésre.</p>
      <label><input type="checkbox" checked={sendConfirmed} onChange={e => setSendConfirmed(e.target.checked)} /> Ellenőriztem a tételeket, és tudatosan elküldöm ezt a valódi rendelést.</label>
      <footer><button className="button button-secondary" disabled={busy} onClick={() => setReview(null)}>Mégsem</button><button className="button button-primary" disabled={busy || !sendConfirmed} onClick={() => void action("/orders/" + review.id + "/send", { confirm_real_order: true })}>Valódi rendelés elküldése</button></footer>
    </section></div>}
  </section>;
}
