import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiAssetUrl } from "../api/client";
import { addCartItem, announceCartChanged, checkoutCart, getCart, getShopOrderPermission, sendShopOrder, removeCartItem, updateCartItem, type Cart, type CartItem, type CheckoutResult } from "../api/cart";
import { SafeImage } from "../components/SafeImage";
import { CardImageZoom } from "../components/CardImageZoom";
import { DiceMagicCheckout } from "../components/DiceMagicCheckout";
import { hkkCardImageUrl } from "../utils/hkk";
import { formatMoney } from "../utils/format";

function imageFor(item: CartItem) {
  // Respect owner-uploaded photos and synchronized partner images.
  if (item.image_url) return apiAssetUrl(item.image_url);
  const printVariant = item.variant === "foil" || item.variant === "fa" || item.variant === "gfa" ? item.variant : "normal";
  return item.external_card_id ? hkkCardImageUrl(item.external_card_id, null, printVariant) : apiAssetUrl(null);
}

const cartStateCopy = {
  order_pending: ["Bolti rendelés folyamatban", "A rendelést itt, a kosárban követheted és folytathatod."],
  available: ["Elérhető", "A készletet a véglegesítéskor ellenőrizzük."],
  quantity_changed: ["Mennyiség megváltozott", "A kért darabszám már nem érhető el teljes egészében."],
  sold_out: ["Elfogyott", "A tételt közben más vásárló megvette."],
  listing_removed: ["Hirdetés megszűnt", "Az eladó vagy a moderáció lezárta a hirdetést."],
} as const;

export function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [key, setKey] = useState(() => sessionStorage.getItem("nightfall-mixed-checkout-key") || crypto.randomUUID());
  const [sendConfirmed, setSendConfirmed] = useState(false);

  const load = () => getCart().then((value) => {
    setCart(value);
    if (value.checkout_resume_key && !sessionStorage.getItem("nightfall-mixed-checkout-key")) {
      setKey(value.checkout_resume_key);
      sessionStorage.setItem("nightfall-mixed-checkout-key", value.checkout_resume_key);
    }
    announceCartChanged(value.item_count);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : "A kosár nem tölthető be."));
  useEffect(() => { void load(); }, []);
  const groups = useMemo(() => Object.values((cart?.items ?? []).reduce<Record<number, { seller: string; items: CartItem[] }>>((acc, item) => { (acc[item.seller_id] ??= { seller: item.seller_name, items: [] }).items.push(item); return acc; }, {})), [cart]);
  const shopItems = cart?.items.filter(item => item.shop_source) ?? [];
  const needsShopDetails = shopItems.some(item => item.state !== "order_pending") && !result?.external_orders?.length;
  const onlyShopPrepared = result?.status === "pending" && result.external_orders?.length && result.external_orders.every(order => order.status === "queued");
  const hasShop = shopItems.length > 0 || Boolean(result?.external_orders?.length);
  const canResumeShopOrder = result?.external_orders?.some(order => ["queued", "unknown"].includes(order.status));
  const resumingShopOrder = Boolean(result?.external_orders?.length);
  const reviewTotal = resumingShopOrder ? Number(result!.total) + result!.external_orders!.reduce((sum, order) => sum + (order.status === "accepted" ? 0 : Number(order.total)), 0) : Number(cart?.total ?? 0);

  async function mutate(action: () => Promise<Cart>) { setBusy(true); setError(""); try { const next = await action(); setCart(next); announceCartChanged(next.item_count); } catch (reason) { setError(reason instanceof Error ? reason.message : "A művelet nem sikerült."); } finally { setBusy(false); } }
  async function finish(recover = false, send = false, details?: Record<string, unknown>, review = false) {
    if (needsShopDetails && !details && !recover) {
      setError("Töltsd ki a bolti rendelési adatokat."); setPreview(true); return;
    }
    if (send && !details && !sendConfirmed) {
      setError("Erősítsd meg a valódi DiceMagic-rendelés elküldését."); return;
    }
    setBusy(true); setError("");
    try {
      if (send) {
        // Check gates before preparing anything; never enable real sending here.
        const permission = await getShopOrderPermission();
        if (!permission.enabled || !permission.orders_enabled || !permission.order_environment_enabled) {
          throw new ApiError("A bolti rendelésküldés jelenleg nincs engedélyezve. Nem küldtünk el rendelést.", 409);
        }
      }
      const mixed = Boolean(cart!.items.some(item => item.shop_source) || result?.external_orders?.length || sessionStorage.getItem("nightfall-mixed-checkout-key"));
      if (mixed) sessionStorage.setItem("nightfall-mixed-checkout-key", key);
      let next = mixed ? await checkoutCart(key, cart!.items.map(item => item.id), details, true) : await checkoutCart(key, cart!.items.map(item => item.id));
      if (send && next.external_orders?.length) {
        setResult(next); // preserve the durable intent if the response is lost
        for (const order of next.external_orders) {
          if (["queued", "unknown"].includes(order.status)) {
            // From this point a lost response is uncertain, never "not sent".
            setResult(current => current ? { ...current, external_orders: current.external_orders?.map(row => row.id === order.id ? { ...row, status: "sending" } : row) } : current);
            const sent = await sendShopOrder(order.id);
            setResult(current => current ? { ...current, external_orders: current.external_orders?.map(row => row.id === order.id ? sent : row) } : current);
          }
        }
        // Same key, existing orchestrator: no second order or parallel workflow.
        next = await checkoutCart(key, undefined, undefined, true);
      }
      setResult(next); setPreview(review && Boolean(next.external_orders?.some(order => ["queued", "unknown"].includes(order.status)))); setSendConfirmed(false);
      if (!next.status || next.status === "completed") { sessionStorage.removeItem("nightfall-mixed-checkout-key"); setKey(crypto.randomUUID()); }
      await load();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 422) {
        // A client-side key from a rejected request is not a prepared order.
        // Keep the same key for safe recovery, but request the missing details.
        sessionStorage.removeItem("nightfall-mixed-checkout-key");
        if (!details && shopItems.length) setPreview(true);
      }
      setError(reason instanceof Error ? reason.message : "A véglegesítés nem sikerült.");
      if (send) { setSendConfirmed(false); await load(); }
    } finally { setBusy(false); }
  }

  if (!cart) return <section className="container page-shell"><p>{error || "Kosár betöltése…"}</p></section>;
  return <section className="container page-shell cart-page">
    <div className="section-heading"><div><p className="eyebrow">Piactér</p><h1>Kosár</h1></div><Link className="button button-secondary" to="/marketplace?listing_type=fixed">Vissza a piactérre</Link></div>
    {error && !preview ? <p className="form-message form-message-error" role="alert">{error}</p> : null}
    {!result && sessionStorage.getItem("nightfall-mixed-checkout-key") && <button className="button button-secondary" disabled={busy} onClick={() => void finish(true, false, undefined, true)}>Rendelés folytatása</button>}
    {result ? <section className="side-panel cart-success" role="status">
      <h2>{onlyShopPrepared ? "Bolti rendelés elküldésre vár" : !result.status || result.status === "completed" ? "Sikeres véglegesítés" : "A rendelés még nincs teljesen visszaigazolva"}</h2>
      {onlyShopPrepared
        ? <p>Még nem küldtük el a DiceMagicnek. Itt, a kosárban folytathatod. Termékösszeg: {formatMoney(result.external_orders!.reduce((sum, order) => sum + Number(order.total), 0))}.</p>
        : <p>{result.transaction_count} ügylet · {result.seller_count} eladó · {result.item_count} tétel · {formatMoney(result.total)}</p>}
      {result.private_error && <p>Magáneladós tételek: {result.private_error}</p>}
      {result.external_orders?.map(order => <p key={order.id}>DiceMagic · {formatMoney(order.total)} · {order.status === "accepted" ? "A bolt visszaigazolta a rendelést." : order.status === "rejected" ? "A bolt elutasította a rendelést." : order.status === "cancelled" ? "A rendelést visszavonták." : "A bolti visszaigazolás még nem érkezett meg."} A fizetést és szállítást a bolttal egyeztetitek.</p>)}
      <Link className="button button-primary" to="/account/transactions">Ügyletek megnyitása</Link>
      {canResumeShopOrder && <button className="button button-primary" disabled={busy} onClick={() => { setSendConfirmed(false); setPreview(true); setError(""); }}>Rendelés folytatása</button>}
      {result.status && result.status !== "completed" && <button className="button button-secondary" disabled={busy} onClick={() => void finish(true)}>Rendelés állapotának frissítése</button>}
    </section> : null}
    {!cart.items.length ? <div className="side-panel empty-state"><h2>A kosarad üres</h2><p>A fix áras lapok és csomagok a piactérről tehetők ide.</p></div> : <>
      <p className="section-note">A kosár nem foglal készletet. Az elérhetőséget és az árat a véglegesítéskor újra ellenőrizzük.</p>
      <div className="cart-list">{cart.items.map((item) => <article className={`cart-item is-${item.state}`} key={item.id}>
        <div className="cart-item-image card-image-zoom-host"><SafeImage src={imageFor(item)} alt={item.title} loading="lazy" /><CardImageZoom src={imageFor(item)} alt={item.title}/></div>
        <div className="cart-item-copy"><h2><Link to={`/auctions/${item.auction_id}`}>{item.title}</Link></h2><p>Eladó: {item.seller_name}{item.variant ? ` · ${item.variant.toUpperCase()}` : ""}</p>{item.listing_format === "bundle" ? <small>Csomag · {item.bundle_items.length} különböző lap</small> : null}</div>
        <div className="cart-quantity">
          <span>Darabszám</span>
          {item.shop_source ? <div className="cart-quantity-stepper" role="group" aria-label={`${item.title} darabszáma`}>
            <button type="button" aria-label={`${item.title} darabszám csökkentése`} disabled={busy || item.state === "order_pending" || item.quantity <= 1} onClick={() => void mutate(() => addCartItem(item.auction_id, item.quantity - 1, true))}>−</button>
            <output aria-live="polite" aria-label={`${item.title} kiválasztott darabszáma`}>{item.quantity}</output>
            <button type="button" aria-label={`${item.title} darabszám növelése`} disabled={busy || item.state === "order_pending" || item.quantity >= Math.min(999, item.max_quantity)} onClick={() => void mutate(() => addCartItem(item.auction_id, item.quantity + 1, true))}>+</button>
          </div> : <select aria-label={`${item.title} darabszáma`} value={item.quantity} disabled={busy || item.listing_format === "bundle" || item.state === "order_pending"} onChange={(event) => void mutate(() => updateCartItem(item.id, Number(event.target.value)))}>{Array.from({ length: Math.max(1, item.max_quantity) }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select>}
          {item.shop_source && item.stock_tracked && item.state !== "order_pending" ? <small>Elérhető: {item.max_quantity} db</small> : null}
        </div>
        <div className="cart-price"><span>{formatMoney(item.unit_price)} / db</span><strong>{formatMoney(item.subtotal)}</strong></div>
        <div className="cart-reservation"><strong>{cartStateCopy[item.state][0]}</strong><small>{cartStateCopy[item.state][1]}</small></div>
        {item.price_changed ? <button className="button button-secondary" disabled={busy} onClick={() => void mutate(() => item.shop_source ? addCartItem(item.auction_id, item.quantity, true, true) : updateCartItem(item.id, item.quantity, true))}>Új ár elfogadása: {formatMoney(item.current_price)}</button> : null}
        <button className="button button-ghost" disabled={busy || item.state === "order_pending"} onClick={() => void mutate(() => removeCartItem(item.id))}>Eltávolítás</button>
      </article>)}</div>
      <footer className="cart-summary"><div><span>{cart.item_count} tétel</span><strong>{formatMoney(cart.total)}</strong></div><button className="button button-primary" disabled={busy || cart.items.some((item) => item.state !== "available" || item.price_changed)} onClick={() => setPreview(true)}>Véglegesítés</button></footer>
    </>}
    {preview ? <div className="vault-confirm-backdrop cart-checkout-backdrop">
      <section className="vault-confirm-dialog cart-checkout-preview" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <header>
          <h2 id="checkout-title">{hasShop ? "Rendelés véglegesítése" : "Vásárlási szándék véglegesítése"}</h2>
          {error && <p className="form-message form-message-error" role="alert">{error}</p>}
        </header>
        <div className="cart-checkout-body">
          {!resumingShopOrder && groups.map(group => <div className="checkout-seller" key={group.seller}><h3>{group.seller}</h3><ul>{group.items.map(item => <li key={item.id}>{item.title} · {item.quantity} db · {formatMoney(item.subtotal)}</li>)}</ul></div>)}
          <strong>Összesen: {formatMoney(reviewTotal)}</strong>
          <p>Nincs online fizetés. A fizetést és az átadást az eladókkal külön egyeztetitek.</p>
          {needsShopDetails && <DiceMagicCheckout items={shopItems} onDetails={details => finish(false, true, details)} onInvalidate={() => setError("")} disabled={busy} orderFromCart formId="cart-shop-order-form" />}
          {hasShop && !needsShopDetails && <>
            <ul>{result?.external_orders?.flatMap(order => order.items.map(item => <li key={`${order.id}:${item.outer_id}`}>{item.name} · {item.quantity} db · {formatMoney(item.line_total_huf)}</li>))}</ul>
            <p>Az eredeti rendelést küldjük el ugyanazzal az azonosítóval. A fizetést és a szállítás díját a DiceMagic kezeli.</p>
            <label><input type="checkbox" checked={sendConfirmed} disabled={busy} onChange={event => setSendConfirmed(event.target.checked)} /> Ellenőriztem a tételeket, és jóváhagyom a valódi rendelés elküldését.</label>
          </>}
        </div>
        <footer>
          <button className="button button-ghost" disabled={busy} onClick={() => { setPreview(false); setSendConfirmed(false); setError(""); }}>Vissza a kosárhoz</button>
          <button className="button button-primary" type={needsShopDetails ? "submit" : "button"} form={needsShopDetails ? "cart-shop-order-form" : undefined} disabled={busy || (hasShop && !needsShopDetails && !sendConfirmed)} onClick={needsShopDetails ? undefined : () => void finish(false, hasShop)}>
            {busy ? "Rendelés folyamatban…" : hasShop ? "Megrendelem" : "Vásárlási szándék véglegesítése"}
          </button>
        </footer>
      </section>
    </div> : null}
  </section>;
}
