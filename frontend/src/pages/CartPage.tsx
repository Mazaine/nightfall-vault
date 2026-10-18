import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { apiAssetUrl } from "../api/client";
import { announceCartChanged, checkoutCart, getCart, removeCartItem, renewCartItem, updateCartItem, type Cart, type CartItem, type CheckoutResult } from "../api/cart";
import { SafeImage } from "../components/SafeImage";
import { hkkCardImageUrl } from "../utils/hkk";
import { formatMoney } from "../utils/format";

function remaining(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) return "";
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function imageFor(item: CartItem) { return item.external_card_id ? hkkCardImageUrl(item.external_card_id, null) : apiAssetUrl(item.image_url); }

export function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [key, setKey] = useState(() => crypto.randomUUID());
  const clockAnchor = useRef<{ serverMs: number; monotonicMs: number } | null>(null);

  const load = () => getCart().then((value) => {
    const serverMs = new Date(value.server_time).getTime();
    clockAnchor.current = { serverMs, monotonicMs: performance.now() };
    setClock(serverMs);
    setCart(value);
    announceCartChanged(value.item_count);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : "A kosár nem tölthető be."));
  useEffect(() => { void load(); }, []);
  useEffect(() => { const timer = window.setInterval(() => { const anchor = clockAnchor.current; if (anchor) setClock(anchor.serverMs + performance.now() - anchor.monotonicMs); }, 1000); return () => window.clearInterval(timer); }, []);
  const groups = useMemo(() => Object.values((cart?.items ?? []).reduce<Record<number, { seller: string; items: CartItem[] }>>((acc, item) => { (acc[item.seller_id] ??= { seller: item.seller_name, items: [] }).items.push(item); return acc; }, {})), [cart]);

  async function mutate(action: () => Promise<Cart>) { setBusy(true); setError(""); try { const next = await action(); setCart(next); announceCartChanged(next.item_count); } catch (reason) { setError(reason instanceof Error ? reason.message : "A művelet nem sikerült."); } finally { setBusy(false); } }
  async function finish() { setBusy(true); setError(""); try { const next = await checkoutCart(key); setResult(next); setPreview(false); setKey(crypto.randomUUID()); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "A véglegesítés nem sikerült."); } finally { setBusy(false); } }

  if (!cart) return <section className="container page-shell"><p>{error || "Kosár betöltése…"}</p></section>;
  return <section className="container page-shell cart-page">
    <div className="section-heading"><div><p className="eyebrow">Piactér</p><h1>Kosár</h1></div><Link className="button button-secondary" to="/marketplace?listing_type=fixed">Vissza a piactérre</Link></div>
    {error ? <p className="form-message form-message-error" role="alert">{error}</p> : null}
    {result ? <section className="side-panel cart-success" role="status"><h2>Sikeres véglegesítés</h2><p>{result.transaction_count} ügylet · {result.seller_count} eladó · {result.item_count} tétel · {formatMoney(result.total)}</p><Link className="button button-primary" to="/account/transactions">Ügyletek megnyitása</Link></section> : null}
    {!cart.items.length ? <div className="side-panel empty-state"><h2>A kosarad üres</h2><p>A fix áras lapok és csomagok a piactérről tehetők ide.</p></div> : <>
      <div className="cart-list">{cart.items.map((item) => { const itemState = item.state === "reserved" && item.reservation_expires_at && new Date(item.reservation_expires_at).getTime() <= clock ? "expired" : item.state; return <article className={`cart-item is-${itemState}`} key={item.id}>
        <SafeImage src={imageFor(item)} alt={item.title} loading="lazy" />
        <div className="cart-item-copy"><h2><Link to={`/auctions/${item.auction_id}`}>{item.title}</Link></h2><p>Eladó: {item.seller_name}{item.variant ? ` · ${item.variant.toUpperCase()}` : ""}</p>{item.listing_format === "bundle" ? <small>Csomag · {item.bundle_items.length} különböző lap</small> : null}</div>
        <label>Darabszám<select aria-label={`${item.title} darabszáma`} value={item.quantity} disabled={busy || item.listing_format === "bundle"} onChange={(event) => void mutate(() => updateCartItem(item.id, Number(event.target.value)))}>{Array.from({ length: Math.max(1, item.max_quantity) }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></label>
        <div className="cart-price"><span>{formatMoney(item.unit_price)} / db</span><strong>{formatMoney(item.subtotal)}</strong></div>
        <div className="cart-reservation">{itemState === "reserved" ? <><strong>Lefoglalva</strong><span>{remaining(item.reservation_expires_at, clock)}</span></> : itemState === "expired" ? <><strong>Foglalás lejárt</strong><small>A lap mások számára ismét elérhető.</small><button className="button button-secondary" disabled={busy} onClick={() => void mutate(() => renewCartItem(item.id))}>Újrafoglalás</button></> : <><strong>Már nem elérhető</strong><small>Ez a tétel jelenleg nem véglegesíthető.</small></>}</div>
        {item.price_changed ? <button className="button button-secondary" disabled={busy} onClick={() => void mutate(() => updateCartItem(item.id, item.quantity, true))}>Új ár elfogadása: {formatMoney(item.current_price)}</button> : null}
        <button className="button button-ghost" disabled={busy} onClick={() => void mutate(() => removeCartItem(item.id))}>Eltávolítás</button>
      </article>; })}</div>
      <footer className="cart-summary"><div><span>{cart.item_count} tétel</span><strong>{formatMoney(cart.total)}</strong></div><button className="button button-primary" disabled={busy || cart.items.some((item) => item.state === "unavailable" || item.price_changed)} onClick={() => setPreview(true)}>Véglegesítés</button></footer>
    </>}
    {preview ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog cart-checkout-preview" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><h2 id="checkout-title">Vásárlási szándék véglegesítése</h2>{groups.map((group) => <div className="checkout-seller" key={group.seller}><h3>{group.seller}</h3><ul>{group.items.map((item) => <li key={item.id}>{item.title} · {item.quantity} db · {formatMoney(item.subtotal)}</li>)}</ul></div>)}<strong>Összesen: {formatMoney(cart.total)}</strong><p>Nincs online fizetés. A fizetést és az átadást az eladókkal külön egyeztetitek.</p><footer><button className="button button-ghost" disabled={busy} onClick={() => setPreview(false)}>Vissza a kosárhoz</button><button className="button button-primary" disabled={busy} onClick={() => void finish()}>{busy ? "Véglegesítés…" : "Vásárlási szándék véglegesítése"}</button></footer></section></div> : null}
  </section>;
}
