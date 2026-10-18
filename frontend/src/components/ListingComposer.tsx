import { FormEvent, useEffect, useMemo, useState } from "react";
import { activateAuction, createAuction, uploadAuctionImage, type AuctionCondition } from "../api/auctions";
import { getHkkMarketPriceSuggestion, type HkkMarketPriceSuggestion, type PrintVariant, type VaultCard } from "../api/vault";
import { ApiError } from "../api/client";
import { categories } from "../data/content";
import { CARD_CONDITIONS } from "../data/cardConditions";
import { CardImagePreview } from "./CardImagePreview";
import { FileImagePreview } from "./FileImagePreview";

export type ListingSource = {
  externalCardId: string;
  cardName: string;
  edition: string | null;
  imageUrl: string | null;
  variants: Pick<VaultCard, "id" | "print_variant" | "quantity" | "trade_quantity" | "loaned_quantity" | "listed_quantity" | "available_listing_quantity" | "variant_needs_review">[];
};

const variantLabel: Record<PrintVariant, string> = { normal: "Normál", foil: "Foil", fa: "FA", gfa: "GFA" };
const MAX_IMAGES = 5;
const MAX_BYTES = 20 * 1024 * 1024;

export function buildHkkMarketPriceUrl(cardName: string) {
  const params = new URLSearchParams();
  params.set("search", cardName);
  params.set("onlyInStock", "false");
  return `https://hkkarfigyelo.hu/?${params.toString()}`;
}

function localIso(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function ListingComposer({ source, compact = false, onClose, onDone }: { source?: ListingSource; compact?: boolean; onClose?: () => void; onDone?: (auctionId: number) => void }) {
  const [mode, setMode] = useState<"fixed" | "auction">("fixed");
  const [variantId, setVariantId] = useState(source?.variants.find((item) => !item.variant_needs_review && (item.available_listing_quantity ?? item.quantity) > 0)?.id ?? 0);
  const selectedVariant = source?.variants.find((item) => item.id === variantId && !item.variant_needs_review);
  const availableQuantity = selectedVariant?.available_listing_quantity ?? selectedVariant?.quantity ?? 0;
  const [quantity, setQuantity] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [cover, setCover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [marketPrice, setMarketPrice] = useState<HkkMarketPriceSuggestion | null>();
  const startDefault = useMemo(() => localIso(new Date()), []);
  const endDefault = useMemo(() => localIso(new Date(Date.now() + 7 * 86_400_000)), []);

  useEffect(() => {
    if (!source || !selectedVariant) { setMarketPrice(null); return; }
    let active = true;
    setMarketPrice(undefined);
    void getHkkMarketPriceSuggestion(source.cardName, source.edition, selectedVariant.print_variant)
      .then((suggestion) => { if (active) setMarketPrice(suggestion); })
      .catch(() => { if (active) setMarketPrice(null); });
    return () => { active = false; };
  }, [selectedVariant?.print_variant, source?.cardName, source?.edition]);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const accepted = Array.from(incoming).filter((file) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_BYTES) {
        setMessage(`${file.name}: csak JPEG, PNG vagy WEBP kép tölthető fel, legfeljebb 20 MB méretben.`);
        return false;
      }
      return true;
    });
    setFiles((current) => [...current, ...accepted].slice(0, MAX_IMAGES));
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    setFiles((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
    if (cover === index) setCover(target); else if (cover === target) setCover(index);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const price = Number(data.get("price"));
    if (!Number.isInteger(price) || price <= 0) return setMessage("Az ár pozitív egész forintösszeg legyen.");
    if (!files.length && !source?.externalCardId) return setMessage("Adj hozzá legalább egy saját fotót.");
    if (source && (!selectedVariant || quantity > availableQuantity)) return setMessage("A kiválasztott mennyiség nem áll szabadon rendelkezésre.");
    const startsAt = new Date(String(data.get("starts_at") || startDefault));
    const duration = Number(data.get("duration") || 7);
    const endsAt = mode === "fixed" ? new Date(Date.now() + 30 * 86_400_000) : new Date(startsAt.getTime() + duration * 86_400_000);
    const buyNow = mode === "fixed" ? price : Number(data.get("buy_now_price") || 0);
    try {
      setBusy(true); setMessage("");
      const auction = await createAuction({
        listing_type: mode,
        vault_collection_card_id: selectedVariant?.id ?? null,
        vault_quantity: selectedVariant ? quantity : null,
        title: String(data.get("title") || source?.cardName || ""),
        description: String(data.get("description") || "Megkímélt gyűjtői lap, a képeken látható állapotban."),
        category: source ? "Hatalom Kártyái Kártyajáték" : String(data.get("category")),
        condition: String(data.get("condition")) as AuctionCondition,
        starting_price: mode === "fixed" ? "0" : String(price),
        bid_increment: mode === "fixed" ? String(price) : String(Number(data.get("bid_increment") || 100)),
        buy_now_enabled: mode === "fixed" || buyNow > 0,
        buy_now_price: mode === "fixed" || buyNow > 0 ? String(buyNow) : null,
        reserve_price: mode === "auction" && Number(data.get("reserve_price") || 0) > 0 ? String(data.get("reserve_price")) : null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        five_minute_rule_enabled: mode === "auction",
        seller_declaration_accepted: true,
      });
      for (let index = 0; index < files.length; index += 1) await uploadAuctionImage(auction.id, files[index], index === cover);
      await activateAuction(auction.id);
      setMessage(mode === "fixed" ? "A fix áras hirdetés elkészült." : "Az aukció elkészült.");
      onDone?.(auction.id);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "A hirdetés létrehozása nem sikerült.");
    } finally { setBusy(false); }
  }

  return <form className={`listing-composer ${compact ? "is-compact" : ""}`} onSubmit={submit}>
    <div className="listing-mode" role="tablist" aria-label="Hirdetés típusa"><button type="button" role="tab" aria-selected={mode === "fixed"} className={mode === "fixed" ? "is-active" : ""} onClick={() => setMode("fixed")}>Fix áras eladás</button><button type="button" role="tab" aria-selected={mode === "auction"} className={mode === "auction" ? "is-active" : ""} onClick={() => setMode("auction")}>Aukció</button></div>
    {source ? <div className="listing-source"><CardImagePreview card={{ external_card_id: source.externalCardId, card_name: source.cardName, image_url: source.imageUrl }} preview={false}/><div><strong>{source.cardName}</strong><small>HKK #{source.externalCardId}{source.edition ? ` · ${source.edition}` : ""}</small></div></div> : <label>Név<input name="title" required minLength={2} maxLength={180}/></label>}
    <div className="listing-fields">
      {source ? <label>Változat<select value={variantId} onChange={(event) => { setVariantId(Number(event.target.value)); setQuantity(1); }}>{source.variants.filter((item) => !item.variant_needs_review && (item.available_listing_quantity ?? item.quantity) > 0).map((item) => <option key={item.id} value={item.id}>{variantLabel[item.print_variant]} · {item.available_listing_quantity ?? item.quantity} db szabad</option>)}</select></label> : <label>Kategória<select name="category">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>}
      {source ? <label>Darabszám<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>{Array.from({ length: Math.max(availableQuantity, 1) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label> : null}
      <label>{mode === "fixed" ? "Fix ár" : "Kikiáltási ár"}<span className="listing-money-input"><input name="price" type="number" min="1" step="1" required/><span>Ft</span></span></label>
      <label>Állapot<select name="condition" defaultValue="NM">{CARD_CONDITIONS.map((item) => <option value={item.value} key={item.value}>{item.nameHu}</option>)}</select></label>
    </div>
    {source && selectedVariant ? <div className="listing-inventory-summary" aria-label="Készletbontás"><span>Saját: <strong>{selectedVariant.quantity}</strong></span><span>Cserében: <strong>{selectedVariant.trade_quantity ?? 0}</strong></span><span>Kölcsönadva: <strong>{selectedVariant.loaned_quantity ?? 0}</strong></span><span>Meghirdetve: <strong>{selectedVariant.listed_quantity ?? 0}</strong></span><span>Szabadon hirdethető: <strong>{availableQuantity}</strong></span></div> : null}
    {source && !selectedVariant ? <p className="form-message" role="status">Ehhez a laphoz nincs hitelesített, szabadon hirdethető változat. A felülvizsgálandó készletet az adminisztrátor javíthatja.</p> : null}
    {source ? <aside className="listing-market-price-note"><span className="listing-market-price-line"><a href={buildHkkMarketPriceUrl(source.cardName)} target="_blank" rel="noopener noreferrer">Piaci árak megtekintése</a>{marketPrice === undefined ? <span>Árjavaslat betöltése…</span> : marketPrice?.recommended_price ? <strong>Ajánlott ár: {marketPrice.recommended_price.toLocaleString("hu-HU")} Ft</strong> : <span>Nincs elég pontos piaci adat.</span>}</span>{marketPrice?.recommended_price ? <small>{marketPrice.offer_count} készleten lévő, egyező bolti ár mediánja{marketPrice.minimum_price !== marketPrice.maximum_price ? ` · ${marketPrice.minimum_price?.toLocaleString("hu-HU")}–${marketPrice.maximum_price?.toLocaleString("hu-HU")} Ft` : ""}. Az ármezőt nem módosítjuk automatikusan.</small> : null}<small>A bolti árak tájékoztató jellegűek. Ellenőrizd a kiegészítőt és a lapváltozatot!</small></aside> : null}
    {mode === "auction" ? <div className="listing-fields"><label>Indulás<input name="starts_at" type="datetime-local" defaultValue={startDefault} required/></label><label>Időtartam<select name="duration" defaultValue="7"><option value="1">1 nap</option><option value="3">3 nap</option><option value="7">7 nap</option><option value="14">14 nap</option></select></label><label>Licitlépcső<input name="bid_increment" type="number" min="1" step="1" defaultValue="100"/></label><label>Azonnali vételár<input name="buy_now_price" type="number" min="1" step="1" placeholder="Opcionális"/></label><label>Minimálár<input name="reserve_price" type="number" min="1" step="1" placeholder="Opcionális"/><small>A pontos összeg csak neked látható.</small></label></div> : null}
    <label>Rövid leírás / állapotmegjegyzés<textarea name="description" rows={3} minLength={10} maxLength={5000} defaultValue={source ? `${source.cardName}, ${variantLabel[selectedVariant?.print_variant || "normal"]} változat. A képeken látható állapotban.` : ""} required/></label>
    <div className="listing-upload"><span>Saját lapfotók <small>({source ? "opcionális" : "kötelező"})</small></span>{source && !files.length ? <p className="listing-reference-note">Saját fotó nélkül a HKK-referenciakép jelenik meg, „Referenciakép” jelöléssel.</p> : null}<div className="listing-upload-actions"><label className="button button-secondary">Galéria / fájlok<input hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addFiles(event.target.files)}/></label><label className="button button-secondary">Fényképezés<input hidden type="file" accept="image/*" capture="environment" onChange={(event) => addFiles(event.target.files)}/></label></div>
      {files.length ? <div className="listing-image-list">{files.map((file, index) => <article key={`${file.name}-${file.lastModified}-${index}`}><FileImagePreview file={file} alt={`${file.name} előnézete`}/><label><input type="radio" name="cover" checked={cover === index} onChange={() => setCover(index)}/> Borító</label><div><button type="button" aria-label="Kép mozgatása balra" disabled={index === 0} onClick={() => moveImage(index, -1)}>←</button><button type="button" aria-label="Kép mozgatása jobbra" disabled={index === files.length - 1} onClick={() => moveImage(index, 1)}>→</button><button type="button" aria-label="Kép eltávolítása" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div></article>)}</div> : null}
    </div>
    {message ? <p className="form-message" role="status">{message}</p> : null}
    <div className="listing-actions">{onClose ? <button type="button" className="button button-ghost" disabled={busy} onClick={onClose}>Mégse</button> : null}<button className="button button-primary" disabled={busy || Boolean(source && !selectedVariant)}>{busy ? "Mentés…" : mode === "fixed" ? "Meghirdetem fix áron" : "Aukció indítása"}</button></div>
  </form>;
}
