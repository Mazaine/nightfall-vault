import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listAuctions, type Auction, type AuctionListParams } from "../api/auctions";
import { createSavedSearch, deleteSavedSearch, listSavedSearches, type SavedSearch } from "../api/searches";
import { useAuth } from "../AuthContext";
import { AuctionCard } from "../components/AuctionCard";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { toAuctionCardItem } from "../utils/auctionPresentation";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { CARD_CONDITIONS } from "../data/cardConditions";

const CATEGORY_OPTIONS = ["Hatalom Kártyái Kártyajáték", "Pokemon", "One Piece", "Star Wars TCG", "Yu-gi-oh", "Magic the Gathering", "Egyéb"];
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
  q: string;
  title: string;
  description: string;
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
  q: "",
  title: "",
  description: "",
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

const PUBLIC_STATUS_ORDER: Partial<Record<Auction["status"], number>> = {
  active: 0,
  scheduled: 1,
};

function orderAuctionsByStatus(items: Auction[]) {
  return [...items].sort((left, right) => (PUBLIC_STATUS_ORDER[left.status] ?? 4) - (PUBLIC_STATUS_ORDER[right.status] ?? 4));
}

function toParams(filters: FilterState, offset: number): AuctionListParams {
  return {
    q: filters.q || undefined,
    title: filters.title || undefined,
    description: filters.description || undefined,
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
  const { subscribe } = useAuctionRealtime();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const initialFilters = useMemo(() => ({
    ...INITIAL_FILTERS,
    ...Object.fromEntries(Object.keys(INITIAL_FILTERS).filter((key) => searchParams.has(key)).map((key) => [key, searchParams.get(key) ?? ""])),
    soon_ending: searchParams.get("soon_ending") === "true",
    new_only: searchParams.get("new_only") === "true",
  }) as FilterState, [searchParams]);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(initialFilters);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<number | null>(null);
  const [showMoreSavedSearches, setShowMoreSavedSearches] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedSearches([]);
      setSelectedSavedSearchId(null);
      return;
    }
    void listSavedSearches()
      .then(setSavedSearches)
      .catch(() => setSaveMessage("A mentett keresések betöltése nem sikerült."));
  }, [isAuthenticated]);

  useEffect(() => subscribe((snapshot) => {
    setAuctions((items) => {
      if (snapshot.is_listed === false || snapshot.status === "unsold") {
        const nextItems = items.filter((item) => item.id !== snapshot.auction_id);
        if (nextItems.length !== items.length) setTotal((current) => Math.max(0, current - 1));
        return nextItems;
      }
      return orderAuctionsByStatus(items.map((item) => item.id === snapshot.auction_id
        ? { ...item, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count }
        : item));
    });
  }), [subscribe]);

  const params = useMemo(() => toParams(appliedFilters, offset), [appliedFilters, offset]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const page = await listAuctions(params);
      setAuctions(page.items);
      setTotal(page.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Az aukciók betöltése nem sikerült.");
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setOffset(0);
      setAppliedFilters(filters);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters]);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setSelectedSavedSearchId(null);
    setOffset(0);
  };

  const applySavedSearch = (item: SavedSearch) => {
    if (selectedSavedSearchId === item.id) {
      setSelectedSavedSearchId(null);
      setShowMoreSavedSearches(false);
      return;
    }
    const nextFilters: FilterState = {
      ...INITIAL_FILTERS,
      q: item.query ?? "",
      title: item.title ?? "",
      description: item.description ?? "",
      category: item.category ?? "",
      condition: item.condition ?? "",
      min_price: item.min_price === undefined || item.min_price === null ? "" : String(item.min_price),
      max_price: item.max_price === undefined || item.max_price === null ? "" : String(item.max_price),
      min_bids: item.min_bids === undefined || item.min_bids === null ? "" : String(item.min_bids),
      buy_now: item.buy_now === undefined || item.buy_now === null ? "" : String(item.buy_now),
      soon_ending: Boolean(item.soon_ending),
      new_only: Boolean(item.new_only),
    };
    setSelectedSavedSearchId(item.id);
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setOffset(0);
  };

  const saveSearch = async () => {
    const name = window.prompt("A mentett keresés neve:", filters.q || filters.category || "Aukciókeresés");
    if (!name) return;
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      setSaveMessage("A mentett keresés neve legalább 2 karakter legyen.");
      return;
    }
    if (normalizedName.length > 24) {
      setSaveMessage("A mentett keresés neve legfeljebb 24 karakter lehet.");
      return;
    }
    try {
      const savedSearch = await createSavedSearch({ name: normalizedName, ...toParams(filters, 0), limit: undefined, offset: undefined, sort: undefined });
      setSavedSearches((items) => [savedSearch, ...items]);
      setSelectedSavedSearchId(savedSearch.id);
      setSaveMessage("A keresés mentve. Az új találatokról in-app értesítést kapsz.");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "A keresés mentése nem sikerült.");
    }
  };

  const removeSelectedSearch = async () => {
    if (selectedSavedSearchId === null) return;
    try {
      await deleteSavedSearch(selectedSavedSearchId);
      setSavedSearches((items) => items.filter((item) => item.id !== selectedSavedSearchId));
      setSelectedSavedSearchId(null);
      setSaveMessage("A mentett keresést töröltük.");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "A mentett keresés törlése nem sikerült.");
    }
  };

  return (
    <section className="container page-shell">
      <p className="eyebrow">Aukciók</p>
      <div className="section-heading page-heading">
        <div>
          <h1>Aukciók</h1>
          <p className="section-note">Keress kategória, állapot, licitszám, ár és lejárat szerint.</p>
        </div>
        <Link className="button button-primary" to="/auctions/create">Aukció létrehozása</Link>
      </div>

      <form className="filter-panel side-panel" onSubmit={submitFilters}>
        <div className="filter-quick-chips filter-wide" aria-label="Gyorsszűrők">
          <button className={filters.soon_ending ? "is-active" : ""} type="button" aria-pressed={filters.soon_ending} onClick={() => setFilters({ ...filters, soon_ending: !filters.soon_ending })}>24 órán belül lejár</button>
          <button className={filters.new_only ? "is-active" : ""} type="button" aria-pressed={filters.new_only} onClick={() => setFilters({ ...filters, new_only: !filters.new_only })}>Az elmúlt 7 nap új aukciói</button>
          {savedSearches.slice(0, 4).map((item) => (
            <button className={selectedSavedSearchId === item.id ? "is-active saved-search-chip" : "saved-search-chip"} type="button" title={item.name} aria-pressed={selectedSavedSearchId === item.id} onClick={() => applySavedSearch(item)} key={item.id}>{item.name.slice(0, 24)}</button>
          ))}
          {savedSearches.length > 4 ? <div className="saved-search-more">
            <button type="button" className={savedSearches.slice(4).some((item) => item.id === selectedSavedSearchId) ? "is-active" : ""} aria-expanded={showMoreSavedSearches} onClick={() => setShowMoreSavedSearches((open) => !open)}>Továbbiak</button>
            {showMoreSavedSearches ? <div className="saved-search-more-menu">
              {savedSearches.slice(4).map((item) => <button className={selectedSavedSearchId === item.id ? "is-active saved-search-chip" : "saved-search-chip"} type="button" title={item.name} aria-pressed={selectedSavedSearchId === item.id} onClick={() => applySavedSearch(item)} key={item.id}>{item.name.slice(0, 24)}</button>)}
            </div> : null}
          </div> : null}
        </div>
        <label className="filter-wide">
          Gyorskeresés
          <input type="search" maxLength={180} placeholder="Cím vagy leírás" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
        </label>
        <label>Cím<input type="search" maxLength={180} value={filters.title} onChange={(event) => setFilters({ ...filters, title: event.target.value })} /></label>
        <label>Leírás<input type="search" maxLength={180} value={filters.description} onChange={(event) => setFilters({ ...filters, description: event.target.value })} /></label>
        <label>
          Kategória
          <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="">Mind</option>
            {CATEGORY_OPTIONS.map((category) => <option value={category} key={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Termék állapota
          <select value={filters.condition} onChange={(event) => setFilters({ ...filters, condition: event.target.value })}>
            <option value="">Mind</option>
            {CARD_CONDITIONS.map((condition) => <option value={condition.value} key={condition.value}>{condition.nameHu} ({condition.value})</option>)}
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
          <button className="button button-secondary" type="button" onClick={resetFilters}>Alaphelyzet</button>
          {isAuthenticated ? <button className="button button-ghost" type="button" onClick={saveSearch}>Keresés mentése</button> : null}
          {isAuthenticated ? <button className="button button-danger" type="button" disabled={selectedSavedSearchId === null} onClick={() => void removeSelectedSearch()}>Keresés törlése</button> : null}
        </div>
      </form>
      {saveMessage ? <p className="form-message" role="status">{saveMessage}</p> : null}

      {isLoading ? <LoadingState label="Aukciók betöltése" cards={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && !error && auctions.length === 0 ? <EmptyState title="Nincs a szűrésnek megfelelő aukció." action={<button className="button button-secondary" type="button" onClick={resetFilters}>Szűrők törlése</button>} /> : null}

      <div className="auction-grid page-grid" aria-busy={isLoading}>
        {auctions.map((auction, index) => <AuctionCard item={toAuctionCardItem(auction)} index={index} detailPath={`/auctions/${auction.id}`} key={auction.id} />)}
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
