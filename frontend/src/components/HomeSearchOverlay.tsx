import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { listAuctions, type Auction } from "../api/auctions";
import { toAuctionCardItem } from "../utils/auctionPresentation";
import { formatMoney } from "../utils/format";

export const OPEN_HOME_SEARCH_EVENT = "nightfall-open-home-search";

export function HomeSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Auction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    input.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); };
  }, [open, onClose]);
  useEffect(() => {
    if (!open || query.trim().length < 2) { setResults([]); setTotal(0); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      void listAuctions({ q: query.trim(), status: "active", listing_type: "fixed", sort: "balanced", limit: 6 }).then(page => {
        if (!cancelled) { setResults(page.items); setTotal(page.total); }
      }).catch(() => {
        if (!cancelled) { setResults([]); setTotal(0); }
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [open, query]);

  if (!open) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    onClose();
    navigate(`/marketplace?tab=cards&q=${encodeURIComponent(query.trim())}`);
  };
  return <div className="nv-search-root" role="dialog" aria-modal="true" aria-label="Gyorskereső">
    <button className="nv-search-backdrop" aria-label="Kereső bezárása" onClick={onClose} />
    <div className="nv-search-panel">
      <form className="nv-search-head" role="search" onSubmit={submit}>
        <span aria-hidden="true">⌕</span>
        <input ref={input} type="search" aria-label="Keress a HKK-lapok között" value={query} onChange={e => setQuery(e.target.value)} placeholder="Lap neve vagy kiadása…" maxLength={180} />
        <button type="button" className="nv-search-close" onClick={onClose} aria-label="Kereső bezárása">Esc</button>
      </form>
      {query.trim().length < 2 ? <p className="nv-search-hint">Írj be legalább két karaktert a találatokhoz.</p> : loading ? <p className="nv-search-hint" role="status">Keresés…</p> : <div className="nv-search-results">
        <p className="nv-search-count">{total.toLocaleString("hu-HU")} találat</p>
        {results.map(auction => {
          const card = toAuctionCardItem(auction);
          return <Link className="nv-search-result" to={`/auctions/${auction.id}`} onClick={onClose} key={auction.id}>
            <span className="nv-search-thumb">{card.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" />}</span>
            <span className="nv-search-info"><strong>{auction.title}</strong><small>{auction.seller?.full_name || auction.seller?.username || "Eladó"} · Fix ár</small></span>
            <b className="nv-search-price">{formatMoney(auction.buy_now_price ?? auction.current_price)}</b>
          </Link>;
        })}
        {results.length === 0 && <p className="nv-search-hint">Nincs megfelelő aktív találat.</p>}
        {total > results.length && <button className="nv-search-all" type="button" onClick={() => { onClose(); navigate(`/marketplace?tab=cards&q=${encodeURIComponent(query.trim())}`); }}>Összes {total.toLocaleString("hu-HU")} találat a piactéren →</button>}
      </div>}
    </div>
  </div>;
}
