import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAuctions, type Auction, type AuctionListParams } from "../api/auctions";
import { AuctionCard } from "../components/AuctionCard";
import { formatMoney, formatRemainingTime } from "../utils/format";

const CATEGORY_OPTIONS = ["Hatalom Kártyái Kártyajáték", "Pokemon", "One Piece", "Star Wars TCG", "Yu-gi-oh", "Magic the Gathering", "Egyéb"];
const CONDITION_OPTIONS = [
  ["fresh", "Frissen bontott"],
  ["like_new", "Újszerű"],
  ["played", "Játszott"],
  ["damaged", "Sérült"],
  ["worn", "Kopott"],
  ["misprint", "Nyomdahibás"],
];
const SORT_OPTIONS = [
  ["newest", "Legújabb"],
  ["oldest", "Legrégebbi"],
  ["highest_price", "Legmagasabb ár"],
  ["lowest_price", "Legalacsonyabb ár"],
  ["most_bids", "Legtöbb licit"],
  ["fewest_bids", "Legkevesebb licit"],
  ["soon_ending", "Hamarosan lejár"],
  ["buy_now_first", "Villámár előre"],
];

type FilterState = {
  category: string;
  condition: string;
  min_price: string;
  max_price: string;
  min_bids: string;
  buy_now: string;
  soon_ending: boolean;
  new_only: boolean;
  sort: string;
};

const INITIAL_FILTERS: FilterState = {
  category: "",
  condition: "",
  min_price: "",
  max_price: "",
  min_bids: "",
  buy_now: "",
  soon_ending: false,
  new_only: false,
  sort: "newest",
};

function toCardAuction(auction: Auction) {
  const sellerName = auction.seller?.full_name ?? auction.seller?.username ?? "Eladó";
  return {
    id: auction.id,
    title: auction.title,
    type: auction.category,
    price: formatMoney(auction.current_price ?? auction.starting_price),
    step: formatMoney(auction.bid_increment),
    time: formatRemainingTime(auction.ends_at, auction.status),
    sellerName,
    sellerRating: auction.bid_count ? `${auction.bid_count} licit` : "Még nincs licit",
    sellerProfilePath: auction.seller?.username ? `/users/${auction.seller.username}` : undefined,
    buyNowPrice: auction.buy_now_enabled ? auction.buy_now_price : null,
    isClosed: ["ended", "sold", "unsold", "cancelled", "suspended"].includes(auction.status),
  };
}

function toParams(filters: FilterState, offset: number): AuctionListParams {
  return {
    category: filters.category || undefined,
    condition: filters.condition || undefined,
    min_price: filters.min_price || undefined,
    max_price: filters.max_price || undefined,
    min_bids: filters.min_bids || undefined,
    buy_now: filters.buy_now === "" ? undefined : filters.buy_now === "true",
    soon_ending: filters.soon_ending,
    new_only: filters.new_only,
    sort: filters.sort,
    limit: 24,
    offset,
  };
}

export function AuctionsPage() {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useMemo(() => toParams(appliedFilters, offset), [appliedFilters, offset]);

  useEffect(() => {
    setIsLoading(true);
    setError("");
    listAuctions(params)
      .then((page) => {
        setAuctions(page.items);
        setTotal(page.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [params]);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setOffset(0);
  };

  return (
    <section className="container page-shell">
      <p className="eyebrow">Aukciók</p>
      <div className="section-heading page-heading">
        <div>
          <h1>Aktív aukciók</h1>
          <p className="section-note">Keress kategória, állapot, licitszám, ár és lejárat szerint.</p>
        </div>
        <Link className="button button-primary" to="/account">Aukció létrehozása</Link>
      </div>

      <form className="filter-panel side-panel" onSubmit={submitFilters}>
        <label>
          Kategória
          <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="">Mind</option>
            {CATEGORY_OPTIONS.map((category) => <option value={category} key={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Állapot
          <select value={filters.condition} onChange={(event) => setFilters({ ...filters, condition: event.target.value })}>
            <option value="">Mind</option>
            {CONDITION_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Minimum ár
          <input type="number" min="0" value={filters.min_price} onChange={(event) => setFilters({ ...filters, min_price: event.target.value })} />
        </label>
        <label>
          Maximum ár
          <input type="number" min="0" value={filters.max_price} onChange={(event) => setFilters({ ...filters, max_price: event.target.value })} />
        </label>
        <label>
          Minimum licitszám
          <input type="number" min="0" value={filters.min_bids} onChange={(event) => setFilters({ ...filters, min_bids: event.target.value })} />
        </label>
        <label>
          Villámár
          <select value={filters.buy_now} onChange={(event) => setFilters({ ...filters, buy_now: event.target.value })}>
            <option value="">Mind</option>
            <option value="true">Csak villámáras</option>
            <option value="false">Villámár nélkül</option>
          </select>
        </label>
        <label>
          Rendezés
          <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
            {SORT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className="toggle-row compact-toggle">
          <input type="checkbox" checked={filters.soon_ending} onChange={(event) => setFilters({ ...filters, soon_ending: event.target.checked })} />
          Hamarosan lejár
        </label>
        <label className="toggle-row compact-toggle">
          <input type="checkbox" checked={filters.new_only} onChange={(event) => setFilters({ ...filters, new_only: event.target.checked })} />
          Új aukciók
        </label>
        <div className="filter-actions">
          <button className="button button-primary" type="submit">Szűrés</button>
          <button className="button button-secondary" type="button" onClick={resetFilters}>Alaphelyzet</button>
        </div>
      </form>

      {isLoading ? <div className="skeleton-grid">{Array.from({ length: 4 }).map((_, index) => <div className="skeleton-card" key={index} />)}</div> : null}
      {error ? <div className="side-panel form-message">{error}</div> : null}
      {!isLoading && !error && auctions.length === 0 ? <div className="side-panel empty-state">Nincs a szűrésnek megfelelő aukció.</div> : null}

      <div className="auction-grid page-grid">
        {auctions.map((auction, index) => <AuctionCard item={toCardAuction(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />)}
      </div>

      {!isLoading && total > auctions.length ? (
        <div className="pagination-row">
          <button className="button button-secondary" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))}>Előző</button>
          <span>{offset + 1}-{Math.min(offset + 24, total)} / {total}</span>
          <button className="button button-secondary" type="button" disabled={offset + 24 >= total} onClick={() => setOffset(offset + 24)}>Következő</button>
        </div>
      ) : null}
    </section>
  );
}
