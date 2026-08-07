import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listMyBidAuctionsPage, type MyBidAuction, type MyBidAuctionState } from "../api/auctions";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { AuctionCard } from "../components/AuctionCard";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { toAuctionCardItem } from "../utils/auctionPresentation";

const filters: { value: MyBidAuctionState; label: string }[] = [
  { value: "current", label: "Aktuális" },
  { value: "closed", label: "Lezárult" },
];

const PAGE_SIZE = 12;

function personalStatus(item: MyBidAuction): "leading" | "outbid" | "watched" | "exited" | undefined {
  if (item.is_outbid) return "outbid";
  if (item.is_leading) return "leading";
  if (item.is_watched) return "watched";
  if (item.has_exited) return "exited";
  return undefined;
}

export function MyBidsPage() {
  const { subscribe } = useAuctionRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedState = searchParams.get("state") as MyBidAuctionState | null;
  const [filter, setFilter] = useState<MyBidAuctionState>(filters.some((item) => item.value === requestedState) ? requestedState! : "current");
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
  useEffect(() => { if (requestedState !== filter) setSearchParams({ state: filter }, { replace: true }); }, [filter, requestedState, setSearchParams]);

  const changeFilter = (next: MyBidAuctionState) => {
    setFilter(next);
    setOffset(0);
    setSearchParams({ state: next }, { replace: true });
  };
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <section className="container page-shell my-bids-page" aria-labelledby="my-bids-title">
    <div className="section-heading compact-heading">
      <div><span className="eyebrow">RÉSZVÉTEL</span><h1 id="my-bids-title">Licitjeim és figyelőlistám</h1><p>Egy helyen követheted az összes aukciót, amelyben érintett vagy.</p></div>
      <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>
    </div>
    <div className="bid-filter-tabs" role="tablist" aria-label="Részvételek szűrése">
      {filters.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} className={filter === item.value ? "is-active" : ""} onClick={() => changeFilter(item.value)}>{item.label}</button>)}
    </div>
    {loading ? <LoadingState label="Részvételeid betöltése" /> : null}
    {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
    {!loading && !error && items.length === 0 ? <EmptyState title="Ebben a csoportban még nincs aukció" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>}>A licitált és figyelt aukcióid itt jelennek meg.</EmptyState> : null}
    {!loading && !error && items.length > 0 ? <div className="auction-grid my-bids-card-grid">{items.map((item, index) => <AuctionCard
      key={item.auction.id}
      index={index}
      detailPath={`/auctions/${item.auction.id}`}
      item={{
        ...toAuctionCardItem(item.auction),
        personalStatus: personalStatus(item),
        outcomeStatus: item.has_exited ? "exited" : item.auction.status === "sold" && item.has_won ? "won" : ["sold", "unsold", "cancelled", "suspended"].includes(item.auction.status) ? "lost" : undefined,
        topBidId: item.top_bid_id,
        canWithdraw: item.can_withdraw,
        withdrawalBlockReason: item.withdrawal_block_reason,
        participationNote: item.participation_note,
      }}
    />)}</div> : null}
    {!loading && !error && total > PAGE_SIZE ? <nav className="pagination" aria-label="Részvételi oldalak"><button type="button" className="button button-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Előző</button><span>{page} / {pageCount}</span><button type="button" className="button button-ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Következő</button></nav> : null}
  </section>;
}
