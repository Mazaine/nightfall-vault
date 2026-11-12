import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { apiRequest } from "../api/client";
import type { CartItem } from "../api/cart";
import "./DiceMagicCheckout.css";

export function DiceMagicCheckout({ items, onDetails, onInvalidate, disabled = false, orderFromCart = false, formId }: { items: CartItem[]; onDetails?: (details: Record<string, unknown>) => void | Promise<void>; onInvalidate?: () => void; disabled?: boolean; orderFromCart?: boolean; formId?: string }) {
  const [shipping, setShipping] = useState(false);
  const [test, setTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !event.currentTarget.reportValidity()) return;
    const fields = new FormData(event.currentTarget);
    const value = (name: string) => String(fields.get(name) || "");
    const address = { postal_code: value("postal"), city: value("city"), street_address: value("street"), country: "HU" };
    const details = { buyer: { full_name: value("name"), email: value("email"), phone: value("phone") || null }, delivery: { method: shipping ? "shipping" : "pickup", recipient_name: value("name"), ...(shipping ? { address } : {}) }, billing: { name: value("billing_name") || value("name"), address, company: value("company") || null, tax_number: value("tax") || null }, note: value("note"), test_order: test, confirm_real_order: true, consent_data_transfer: true };
    if (onDetails) { await onDetails(details); if (!orderFromCart) setMessage("A bolti adatok ellenőrizve."); return; }
    setBusy(true);
    try { const order = await apiRequest<{ external_order_id: string }>("/api/admin/integrations/dicemagic/orders/prepare", { method: "POST", body: JSON.stringify({ idempotency_key: key, details }) }); setMessage(`Előkészítve: ${order.external_order_id}. A végső küldés az admin integrációs oldalon érhető el.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Az előkészítés nem sikerült."); } finally { setBusy(false); }
  }
  if (!items.length) return null;
  return <section className="side-panel dicemagic-checkout-panel">
    <h2>DiceMagic bolti rendelés</h2>
    <p>{items.length} bolti tétel. A fizetés közvetlenül a DiceMagic felé, átutalással történik. A bolt feldolgozza a rendelést és később egyezteti a szállítás díját; a termékösszeg azt nem tartalmazza.</p>
    <form id={formId} onSubmit={e => void prepare(e)} onChange={() => { onInvalidate?.(); setMessage(""); }}>
      <fieldset className="dicemagic-checkout" disabled={busy || disabled}>
        <label>Teljes név<input name="name" required minLength={2} maxLength={160} /></label>
        <label>E-mail<input name="email" type="email" required /></label>
        <label>Telefonszám (opcionális)<input name="phone" type="tel" maxLength={40} /></label>
        <label>Átvétel<select value={shipping ? "shipping" : "pickup"} onChange={e => setShipping(e.target.value === "shipping")}><option value="pickup">Személyes átvétel</option><option value="shipping">Szállítás</option></select></label>
        <label>Számlázási név (ha eltér)<input name="billing_name" maxLength={160} /></label>
        <label>Cégnév (opcionális)<input name="company" maxLength={160} /></label>
        <label>Adószám (opcionális)<input name="tax" maxLength={40} /></label>
        <p>{shipping ? "Szállítási és számlázási cím" : "Számlázási cím"}</p>
        <label>Irányítószám<input name="postal" required pattern="[0-9]{4}" /></label>
        <label>Település<input name="city" required maxLength={100} /></label>
        <label>Utca, házszám<input name="street" required maxLength={200} /></label>
        <label>Megjegyzés<textarea name="note" maxLength={900} /></label>
        {!orderFromCart && <label><input type="checkbox" checked={test} onChange={e => setTest(e.target.checked)} /> Tesztrendelés</label>}
        {!orderFromCart && test && <p role="note">Ez a tesztrendelés is valódi rendelést hoz létre a DiceMagic webshopban. A törlését és a készlet visszaállítását külön kell egyeztetni.</p>}
        <label><input type="checkbox" required /> {orderFromCart ? "Jóváhagyom az adataim továbbítását és a valódi DiceMagic-rendelés elküldését." : "Jóváhagyom a szükséges adatok DiceMagic részére továbbítását és a valódi rendelés előkészítését."}</label>
        <p>A rendeléshez megadott név-, cím-, elérhetőségi és megjegyzésadatokat a DiceMagicnek továbbítjuk. A lezárás és az egyeztetések után 90 napos megőrzési szabály vonatkozik rájuk; nyitott ügyet ez nem érint. <Link to="/privacy" target="_blank" rel="noopener noreferrer">Adatkezelési részletek</Link></p>
        {!orderFromCart && <button className="button button-secondary" disabled={busy || disabled}>{onDetails ? "Bolti adatok ellenőrzése" : "Bolti rendelés előkészítése"}</button>}
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
    {!onDetails && <Link to="/admin/integrations/dicemagic">Bolti rendelések és végső küldés</Link>}
  </section>;
}
