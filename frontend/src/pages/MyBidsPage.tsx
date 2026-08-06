import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listMyBidAuctionsPage, type MyBidAuction, type MyBidAuctionState } from "../api/auctions";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { SafeImage } from "../components/SafeImage";
import { apiAssetUrl } from "../api/client";
import { formatAuctionStatus, formatMoney, formatRemainingTime } from "../utils/format";

const filters: { value: MyBidAuctionState; label: string }[] = [
  { value: "all", label: "Összes" },
  { value: "outbid", label: "Rám licitáltak" },
  { value: "leading", label: "Én vezetek" },
  { value: "active", label: "Aktív" },
  { value: "closed", label: "Lezárt" },
  { value: "won", label: "Megnyert" },
];

const PAGE_SIZE = 12;

function bidState(item: MyBidAuction) {
  if (item.has_won) return "Megnyerted";
  if (item.is_outbid) return "Rád licitáltak";
  if (item.is_leading) return "Te vezetsz";
  return formatAuctionStatus(item.auction.status);
}

export function MyBidsPage() {
  const { subscribe } = useAuctionRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedState = searchParams.get("state") as MyBidAuctionState | null;
  const [filter, setFilter] = useState<MyBidAuctionState>(filters.some((item) => item.value === requestedState) ? requestedState! : "all");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<MyBidAuction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const page = await listMyBidAuctionsPage(filter, PAGE_SIZE, offset);
      setItems(page.items);
      setTotal(page.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A licitjeid betöltése nem sikerült.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter, offset]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribe(() => { void load(true); }), [load, subscribe]);

  const changeFilter = (next: MyBidAuctionState) => { setFilter(next); setOffset(0); setSearchParams(next === "all" ? {} : { state: next }, { replace: true }); };
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="container page-shell my-bids-page" aria-labelledby="my-bids-title">
      <div className="section-heading compact-heading">
        <div><span className="eyebrow">LICITÁLÁS</span><h1 id="my-bids-title">Licitjeim</h1><p>Azok az aukciók, amelyeken aktív licited van vagy már eredmény született.</p></div>
        <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>
      </div>
      <div className="bid-filter-tabs" role="tablist" aria-label="Licitjeim szűrése">
        {filters.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} className={filter === item.value ? "is-active" : ""} onClick={() => changeFilter(item.value)}>{item.label}</button>)}
      </div>
      {loading ? <LoadingState label="Licitjeid betöltése" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="Itt még nincs megjeleníthető licit" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>}>Böngéssz az aukciók között, és tedd meg az első licitedet.</EmptyState> : null}
      {!loading && !error && items.length > 0 ? <div className="my-bids-card-grid">{items.map((item) => {
        const image = item.auction.images.find((entry) => entry.is_cover) ?? item.auction.images[0];
        return <article className={`my-bid-card${item.is_outbid ? " is-outbid" : item.is_leading ? " is-leading" : ""}`} key={item.auction.id}>
          <Link className="my-bid-card-image" to={`/auctions/${item.auction.id}`}>{image ? <SafeImage src={apiAssetUrl(image.list_url ?? image.thumbnail_url ?? image.url)} alt="" loading="lazy" width={640} height={420} /> : <span aria-hidden="true" />}</Link>
          <div className="my-bid-card-copy"><span className="bid-state-badge">{bidState(item)}</span><h2><Link to={`/auctions/${item.auction.id}`}>{item.auction.title}</Link></h2><dl><div><dt>Jelenlegi ár</dt><dd>{formatMoney(item.auction.current_price)}</dd></div><div><dt>Utolsó aktív licited</dt><dd>{formatMoney(item.my_highest_bid)}</dd></div><div><dt>Licitlépcső</dt><dd>{formatMoney(item.auction.bid_increment)}</dd></div><div><dt>Hátralévő idő</dt><dd>{formatRemainingTime(item.auction.ends_at, item.auction.status)}</dd></div></dl><div className="my-bid-card-actions"><Link className="button button-primary" to={`/auctions/${item.auction.id}#bid-section`}>{item.is_outbid ? "Új licit" : "Aukció megnyitása"}</Link>{item.transaction_id ? <Link className="button button-ghost" to={`/account/transactions#transaction-${item.transaction_id}`}>Tranzakció</Link> : null}</div></div>
        </article>;
      })}</div> : null}
      {!loading && !error && total > PAGE_SIZE ? <nav className="pagination" aria-label="Licitjeim oldalak"><button type="button" className="button button-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Előző</button><span>{page} / {pageCount}</span><button type="button" className="button button-ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Következő</button></nav> : null}
    </section>
  );
}
