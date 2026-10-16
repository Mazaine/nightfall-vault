import { useMemo, useState } from "react";
import type { PublicTradeCard, VaultCard } from "../api/vault";
import { createFixedListingBatch, uploadAuctionImage, type AuctionCondition } from "../api/auctions";
import { CardImagePreview } from "./CardImagePreview";

type Mode = "individual" | "bundle";
type Draft = { card: PublicTradeCard; collection: VaultCard; quantity: number; basePrice: number; finalPrice: number; manual: boolean; condition: AuctionCondition; description: string };

const discounted = (price: number, percent: number) => Math.max(1, Math.round(price * (100 - percent) / 100));

export function VaultBulkListingComposer({ tradeCards, collectionCards, onDone, onActiveChange }: { tradeCards: PublicTradeCard[]; collectionCards: VaultCard[]; onDone: (message: string) => Promise<void> | void; onActiveChange?: (active: boolean) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [discount, setDiscount] = useState(0);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundlePrice, setBundlePrice] = useState(0);
  const [bundlePhotos, setBundlePhotos] = useState<File[]>([]);
  const matches = useMemo(() => tradeCards.map((card) => ({ card, collection: collectionCards.find((item) => item.external_card_id === card.external_card_id && item.print_variant === card.print_variant) })).filter((item): item is { card: PublicTradeCard; collection: VaultCard } => Boolean(item.collection)), [tradeCards, collectionCards]);
  const selected = Object.values(drafts);
  const total = selected.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);

  function chooseMode(next: Mode) {
    if (mode && mode !== next && selected.length) { setPendingMode(next); return; }
    setMode(next); onActiveChange?.(true); setPreview(false); setError("");
  }
  function reset(next: Mode | null = null) {
    setDrafts({}); setDiscount(0); setPreview(false); setMode(next); onActiveChange?.(Boolean(next)); setPendingMode(null); setError(""); setBundleName(""); setBundleDescription(""); setBundlePrice(0); setBundlePhotos([]);
  }
  function toggle(card: PublicTradeCard, collection: VaultCard) {
    setDrafts((current) => {
      if (current[collection.id]) { const next = { ...current }; delete next[collection.id]; return next; }
      return { ...current, [collection.id]: { card, collection, quantity: 1, basePrice: 0, finalPrice: 0, manual: false, condition: "NM", description: `${card.card_name}, ${card.print_variant} változat. A képeken látható állapotban.` } };
    });
  }
  function change(id: number, patch: Partial<Draft>) { setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } })); }
  function changeBase(id: number, value: number) {
    const item = drafts[id]; change(id, { basePrice: value, ...(item.manual ? {} : { finalPrice: value > 0 ? discounted(value, discount) : 0 }) });
  }
  function changeDiscount(value: number) {
    const normalized = Math.max(0, Math.min(99, value)); setDiscount(normalized);
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, item.manual ? item : { ...item, finalPrice: item.basePrice > 0 ? discounted(item.basePrice, normalized) : 0 }])));
  }
  function validate() {
    if (!selected.length) return "Jelölj ki legalább egy lapot.";
    if (mode === "bundle" && selected.length < 2) return "Csomaghirdetéshez legalább két különböző lapot jelölj ki.";
    if (selected.some((item) => item.basePrice <= 0 || item.finalPrice <= 0)) return "Minden kijelölt laphoz pozitív kiindulási és végleges árat adj meg.";
    if (mode === "bundle" && (!bundleName.trim() || bundleDescription.trim().length < 10 || bundlePrice <= 0)) return "A csomagnév, legalább 10 karakteres leírás és pozitív csomagár kötelező.";
    return "";
  }
  function openPreview() { const issue = validate(); if (issue) { setError(issue); return; } setError(""); setPreview(true); }
  async function finalize() {
    if (!mode) return;
    try {
      setBusy(true); setError("");
      const result = await createFixedListingBatch({
        creation_key: crypto.randomUUID(), mode, discount_percent: discount,
        bundle_name: mode === "bundle" ? bundleName.trim() : null,
        bundle_description: mode === "bundle" ? bundleDescription.trim() : null,
        bundle_price: mode === "bundle" ? bundlePrice : null,
        items: selected.map((item) => ({ vault_collection_card_id: item.collection.id, quantity: item.quantity, base_price: item.basePrice, final_price: item.finalPrice, condition: item.condition, description: item.description })),
      });
      if (mode === "bundle" && bundlePhotos.length && result.auctions[0]) {
        await Promise.all(bundlePhotos.slice(0, 5).map((file, index) => uploadAuctionImage(result.auctions[0].id, file, index === 0)));
      }
      const count = result.auctions.length;
      reset(); await onDone(mode === "bundle" ? "A csomaghirdetés megjelent a Piactéren." : `${count} fix áras hirdetés megjelent a Piactéren.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A véglegesítés nem sikerült."); }
    finally { setBusy(false); }
  }

  return <section className="vault-bulk-listing">
    <div className="vault-bulk-modebar"><strong>Több lap meghirdetése</strong><div><button type="button" className={`button ${mode === "individual" ? "button-primary" : "button-secondary"}`} onClick={() => chooseMode("individual")}>Laponkénti eladás</button><button type="button" className={`button ${mode === "bundle" ? "button-primary" : "button-secondary"}`} onClick={() => chooseMode("bundle")}>Csoportos eladás</button></div></div>
    {mode ? <><div className="vault-bulk-toolbar"><label>Kedvezmény <input aria-label="Kedvezmény százalék" type="number" min="0" max="99" value={discount} onChange={(event) => changeDiscount(Number(event.target.value))}/>%</label><strong>{selected.length} lap · {total.toLocaleString("hu-HU")} Ft</strong></div>
      {mode === "bundle" ? <div className="vault-bundle-fields"><label>Csomagnév<input value={bundleName} onChange={(event) => setBundleName(event.target.value)} maxLength={180}/></label><label>Csomagár<input type="number" min="1" value={bundlePrice || ""} onChange={(event) => setBundlePrice(Number(event.target.value))}/></label><label className="is-wide">Leírás<textarea value={bundleDescription} onChange={(event) => setBundleDescription(event.target.value)} maxLength={5000}/></label><label className="is-wide">Saját fotók (opcionális)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setBundlePhotos(Array.from(event.target.files || []).slice(0, 5))}/></label></div> : null}
      <div className="vault-bulk-grid">{matches.map(({ card, collection }) => { const item = drafts[collection.id]; return <article className={`vault-bulk-card${item ? " is-selected" : ""}`} key={collection.id}><label className="vault-bulk-select"><input type="checkbox" checked={Boolean(item)} onChange={() => toggle(card, collection)}/><span>Kijelölés</span></label><CardImagePreview card={card} preview={false}/><strong>{card.card_name}</strong><small>#{card.external_card_id} · {card.print_variant.toUpperCase()} · {card.quantity} db cserében</small>{item ? <div className="vault-bulk-card-fields"><label>Db<select value={item.quantity} onChange={(event) => change(collection.id, { quantity: Number(event.target.value) })}>{Array.from({ length: Math.min(card.quantity, collection.quantity) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label><label>Kiindulási ár<input aria-label={`${card.card_name} kiindulási ár`} type="number" min="1" value={item.basePrice || ""} onChange={(event) => changeBase(collection.id, Number(event.target.value))}/></label><label>Végleges ár<input aria-label={`${card.card_name} végleges ár`} type="number" min="1" value={item.finalPrice || ""} onChange={(event) => change(collection.id, { finalPrice: Number(event.target.value), manual: true })}/></label><small className={item.manual ? "is-manual" : ""}>{item.manual ? "Kézzel módosított" : "Kedvezményből számolt"}{item.manual ? <button type="button" onClick={() => change(collection.id, { manual: false, finalPrice: discounted(item.basePrice, discount) })}>Visszaállítás</button> : null}</small></div> : null}</article>; })}</div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}<div className="vault-bulk-footer"><button type="button" className="button button-ghost" onClick={() => reset()}>Mégsem adom el</button><button type="button" className="button button-primary" disabled={!selected.length || busy} onClick={openPreview}>Lapok véglegesítése</button></div></> : null}
    {preview ? <div className="vault-confirm-backdrop" role="presentation"><section className="vault-confirm-dialog vault-bulk-preview" role="dialog" aria-modal="true" aria-labelledby="bulk-preview-title"><h2 id="bulk-preview-title">Véglegesítési előnézet</h2><p>{mode === "bundle" ? `1 csomaghirdetés · ${selected.length} különböző lap` : `${selected.length} különálló fix áras hirdetés`}</p><ul>{selected.map((item) => <li key={item.collection.id}>{item.card.card_name} · {item.card.print_variant.toUpperCase()} · {item.quantity} db · {item.finalPrice.toLocaleString("hu-HU")} Ft</li>)}</ul><strong>Összérték: {(mode === "bundle" ? bundlePrice : total).toLocaleString("hu-HU")} Ft</strong><footer><button type="button" className="button button-ghost" onClick={() => setPreview(false)}>Vissza</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void finalize()}>{busy ? "Véglegesítés…" : "Meghirdetem"}</button></footer></section></div> : null}
    {pendingMode ? <div className="vault-confirm-backdrop" role="presentation"><section className="vault-confirm-dialog" role="dialog" aria-modal="true" aria-label="Eladási mód váltása"><h2>Eladási mód váltása</h2><p>A váltás törli a jelenlegi kijelölést és árakat.</p><footer><button type="button" className="button button-ghost" onClick={() => setPendingMode(null)}>Mégse</button><button type="button" className="button button-primary" onClick={() => reset(pendingMode)}>Váltás</button></footer></section></div> : null}
  </section>;
}
