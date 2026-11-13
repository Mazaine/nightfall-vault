import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { listAuctions, type Auction, type AuctionListParams, type HatalomEra } from "../api/auctions";
import { createSavedSearch, deleteSavedSearch, listSavedSearches, type SavedSearch } from "../api/searches";
import { useAuth } from "../AuthContext";
import { AuctionCard } from "../components/AuctionCard";
import { CardViewSwitch } from "../components/CardViewSwitch";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { toAuctionCardItem } from "../utils/auctionPresentation";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { CARD_CONDITIONS } from "../data/cardConditions";
import "./home/HomeShowcase.css";

const CATEGORY_OPTIONS = ["Hatalom Kártyái Kártyajáték", "Pokemon", "One Piece", "Star Wars TCG", "Yu-gi-oh", "Magic the Gathering", "Egyéb"];
const SORT_OPTIONS = [
  ["balanced", "Ajánlott · minden eladótól"],
  ["newest", "Legújabb"],
  ["oldest", "Legrégebbi"],
  ["highest_price", "Legmagasabb ár"],
  ["lowest_price", "Legalacsonyabb ár"],
  ["most_bids", "Legtöbb licit"],
  ["fewest_bids", "Legkevesebb licit"],
  ["soon_ending", "Hamarosan lejár"],
  ["buy_now_first", "Villámár előre"],
];

type MarketTab = "auctions" | "cards" | "bundles";

type FilterState = {
  q: string;
  title: string;
  description: string;
  seller: string;
  category: string;
  hatalom_era: HatalomEra | "";
  condition: string;
  status: string;
  listing_type: "" | "auction" | "fixed";
  listing_format: "" | "single" | "bundle";
  variant: "" | "normal" | "foil" | "fa" | "gfa";
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
  seller: "",
  category: "",
  hatalom_era: "",
  condition: "",
  status: "",
  listing_type: "",
  listing_format: "",
  variant: "",
  min_price: "",
  max_price: "",
  min_bids: "",
  buy_now: "",
  soon_ending: false,
  new_only: false,
  sort: "balanced",
};

function filtersForTab(filters: FilterState, tab: MarketTab): FilterState {
  if (tab === "auctions") return { ...filters, variant: "" };
  return {
    ...filters,
    min_bids: "",
    buy_now: "",
    soon_ending: false,
    new_only: false,
    sort: ["most_bids", "fewest_bids", "soon_ending", "buy_now_first"].includes(filters.sort) ? "balanced" : filters.sort,
    ...(tab === "cards" ? { title: "", description: "" } : {}),
  };
}

const PUBLIC_STATUS_ORDER: Partial<Record<Auction["status"], number>> = {
  active: 0,
  scheduled: 1,
};

const MOBILE_FILTER_MEDIA_QUERY = "(max-width: 760px)";
const MARKETPLACE_DISPLAY_MODE_KEY = "nightfall-vault-marketplace-display-mode";
type MarketplaceDisplayMode = "grid" | "list";

function isMobileFilterViewport() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(MOBILE_FILTER_MEDIA_QUERY).matches);
}

function activeFilterEntries(filters: FilterState) {
  const condition = CARD_CONDITIONS.find((item) => item.value === filters.condition)?.nameHu;
  const eraLabels: Record<string, string> = { retro: "RETRO", ujkor: "Újkor", uj_nemzedek: "Új nemzedék" };
  return [
    filters.status === "active" ? { key: "status", label: "Aktív aukciók" } : null,
    filters.listing_type ? { key: "listing_type", label: filters.listing_type === "fixed" ? "Fix áras lapok" : "Aukciók" } : null,
    filters.listing_format ? { key: "listing_format", label: filters.listing_format === "bundle" ? "Csomagok / boosterek és kiegészítők" : "Egyedi hirdetések" } : null,
    filters.q ? { key: "q", label: `Keresés: ${filters.q}` } : null,
    filters.title ? { key: "title", label: `Cím: ${filters.title}` } : null,
    filters.description ? { key: "description", label: `Leírás: ${filters.description}` } : null,
    filters.seller ? { key: "seller", label: `Eladó: ${filters.seller}` } : null,
    filters.category ? { key: "category", label: `Kategória: ${filters.category}` } : null,
    filters.hatalom_era ? { key: "hatalom_era", label: `Korszak: ${eraLabels[filters.hatalom_era]}` } : null,
    filters.condition ? { key: "condition", label: `Állapot: ${condition ?? filters.condition}` } : null,
    filters.variant ? { key: "variant", label: `Változat: ${filters.variant.toUpperCase()}` } : null,
    filters.min_price ? { key: "min_price", label: `Minimum ár: ${filters.min_price} Ft` } : null,
    filters.max_price ? { key: "max_price", label: `Maximum ár: ${filters.max_price} Ft` } : null,
    filters.min_bids ? { key: "min_bids", label: `Minimum licit: ${filters.min_bids}` } : null,
    filters.buy_now ? { key: "buy_now", label: filters.buy_now === "true" ? "Csak villámáras" : "Villámár nélkül" } : null,
    filters.soon_ending ? { key: "soon_ending", label: "Hamarosan lejár" } : null,
    filters.new_only ? { key: "new_only", label: "Új aukciók" } : null,
    filters.sort !== INITIAL_FILTERS.sort ? { key: "sort", label: `Rendezés: ${SORT_OPTIONS.find(([value]) => value === filters.sort)?.[1] ?? filters.sort}` } : null,
  ].filter((item): item is { key: keyof FilterState; label: string } => item !== null);
}

function orderAuctionsByStatus(items: Auction[]) {
  return [...items].sort((left, right) => (PUBLIC_STATUS_ORDER[left.status] ?? 4) - (PUBLIC_STATUS_ORDER[right.status] ?? 4));
}

function toParams(filters: FilterState, offset: number): AuctionListParams {
  return {
    q: filters.q || undefined,
    title: filters.title || undefined,
    description: filters.description || undefined,
    seller: filters.seller || undefined,
    category: filters.category || undefined,
    hatalom_era: filters.hatalom_era || undefined,
    condition: filters.condition || undefined,
    status: filters.status || undefined,
    listing_type: filters.listing_type || undefined,
    listing_format: filters.listing_format || undefined,
    variant: filters.variant || undefined,
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
  const location = useLocation();
  const { subscribe } = useAuctionRealtime();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const marketTab: MarketTab = location.pathname === "/marketplace/fixed"
    ? "cards"
    : requestedTab === "cards" || requestedTab === "bundles"
      ? requestedTab
      : searchParams.get("listing_type") === "fixed"
        ? searchParams.get("listing_format") === "bundle" ? "bundles" : "cards"
        : "auctions";
  const { isAuthenticated } = useAuth();
  const initialFilters = useMemo(() => ({
    ...INITIAL_FILTERS,
    ...Object.fromEntries(Object.keys(INITIAL_FILTERS).filter((key) => searchParams.has(key)).map((key) => [key, searchParams.get(key) ?? ""])),
    soon_ending: searchParams.get("soon_ending") === "true",
    new_only: searchParams.get("new_only") === "true",
  }) as FilterState, [searchParams]);
  const initialTabFilters = useMemo(() => filtersForTab(initialFilters, marketTab), [initialFilters, marketTab]);
  const [filters, setFilters] = useState<FilterState>(initialTabFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(initialTabFilters);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<number | null>(null);
  const [showMoreSavedSearches, setShowMoreSavedSearches] = useState(false);
  const [isMobile, setIsMobile] = useState(isMobileFilterViewport);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<MarketplaceDisplayMode>(() => {
    try { return window.localStorage.getItem(MARKETPLACE_DISPLAY_MODE_KEY) === "list" ? "list" : "grid"; }
    catch { return "grid"; }
  });
  const resultsRef = useRef<HTMLDivElement>(null);
  const previousTabRef = useRef<MarketTab>(marketTab);
  const tabFiltersRef = useRef<Record<MarketTab, FilterState>>({ auctions: { ...INITIAL_FILTERS }, cards: { ...INITIAL_FILTERS }, bundles: { ...INITIAL_FILTERS } });
  const tabAppliedRef = useRef<Record<MarketTab, FilterState>>({ auctions: { ...INITIAL_FILTERS }, cards: { ...INITIAL_FILTERS }, bundles: { ...INITIAL_FILTERS } });
  const appliedFilterEntries = useMemo(() => activeFilterEntries(appliedFilters), [appliedFilters]);
  const visibleSavedSearches = useMemo(() => savedSearches.filter((item) => marketTab === "auctions"
    ? (item.listing_type ?? "auction") === "auction"
    : item.listing_type === "fixed" && item.listing_format === (marketTab === "cards" ? "single" : "bundle")), [marketTab, savedSearches]);

  useEffect(() => {
    const previousTab = previousTabRef.current;
    if (previousTab === marketTab) return;
    tabFiltersRef.current[previousTab] = filters;
    tabAppliedRef.current[previousTab] = appliedFilters;
    const nextFilters = filtersForTab(tabFiltersRef.current[marketTab], marketTab);
    const nextApplied = filtersForTab(tabAppliedRef.current[marketTab], marketTab);
    previousTabRef.current = marketTab;
    setFilters(nextFilters);
    setAppliedFilters(nextApplied);
    setFiltersOpen(false);
    setSelectedSavedSearchId(null);
  }, [marketTab]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia(MOBILE_FILTER_MEDIA_QUERY);
    const updateViewport = () => setIsMobile(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener?.("change", updateViewport);
    return () => mediaQuery.removeEventListener?.("change", updateViewport);
  }, []);

  const changeDisplayMode = (mode: MarketplaceDisplayMode) => {
    setDisplayMode(mode);
    try { window.localStorage.setItem(MARKETPLACE_DISPLAY_MODE_KEY, mode); } catch { /* The selection still works when storage is disabled. */ }
  };

  const focusResultsOnMobile = () => {
    if (!isMobile) return;
    window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

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

  const params = useMemo(() => ({
    ...toParams(appliedFilters, offset),
    listing_type: marketTab === "auctions" ? "auction" as const : "fixed" as const,
    listing_format: marketTab === "auctions" ? undefined : marketTab === "cards" ? "single" as const : "bundle" as const,
    marketplace_scope: undefined,
  }), [appliedFilters, offset, marketTab]);

  useEffect(() => setOffset(0), [marketTab]);

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
    if (isMobile) return;
    const timeout = window.setTimeout(() => {
      setOffset(0);
      setAppliedFilters(filters);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters, isMobile]);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const scoped = filtersForTab(filters, marketTab);
    setOffset(0);
    setFilters(scoped);
    setAppliedFilters(scoped);
    setFiltersOpen(false);
    focusResultsOnMobile();
  };

  const resetFilters = () => {
    const reset = filtersForTab({ ...INITIAL_FILTERS }, marketTab);
    setFilters(reset);
    setAppliedFilters(reset);
    setSelectedSavedSearchId(null);
    setOffset(0);
    focusResultsOnMobile();
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
      seller: item.seller ?? "",
      category: item.category ?? "",
      hatalom_era: item.hatalom_era ?? "",
      condition: item.condition ?? "",
      variant: item.variant ?? "",
      min_price: item.min_price === undefined || item.min_price === null ? "" : String(item.min_price),
      max_price: item.max_price === undefined || item.max_price === null ? "" : String(item.max_price),
      min_bids: item.min_bids === undefined || item.min_bids === null ? "" : String(item.min_bids),
      buy_now: item.buy_now === undefined || item.buy_now === null ? "" : String(item.buy_now),
      soon_ending: Boolean(item.soon_ending),
      new_only: Boolean(item.new_only),
    };
    const scoped = filtersForTab(nextFilters, marketTab);
    setSelectedSavedSearchId(item.id);
    setFilters(scoped);
    setAppliedFilters(scoped);
    setOffset(0);
    if (isMobile) setFiltersOpen(false);
    focusResultsOnMobile();
  };

  const removeAppliedFilter = (key: keyof FilterState) => {
    const nextFilters = {
      ...appliedFilters,
      [key]: INITIAL_FILTERS[key],
      ...(key === "category" ? { hatalom_era: "" } : {}),
    } as FilterState;
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setSelectedSavedSearchId(null);
    setOffset(0);
    focusResultsOnMobile();
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
      const savedSearch = await createSavedSearch({
        name: normalizedName,
        ...toParams(filtersForTab(filters, marketTab), 0),
        listing_type: marketTab === "auctions" ? "auction" : "fixed",
        listing_format: marketTab === "auctions" ? undefined : marketTab === "cards" ? "single" : "bundle",
        limit: undefined, offset: undefined, sort: undefined,
      });
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
    <section className="container page-shell marketplace-page">
      <div className="section-heading page-heading marketplace-hero">
        <div>
          <p className="eyebrow">Piactér</p>
          <h1>Piactér</h1>
          <p className="section-note">Aukciók, fix áras HKK-lapok, csomagok, boosterek és kiegészítők egy helyen.</p>
        </div>
        <Link className="button button-primary" to={marketTab === "auctions" ? "/auctions/create" : "/vault?area=trade"}>{marketTab === "auctions" ? "Aukció létrehozása" : "Hirdetés feladása"}</Link>
      </div>

      <nav className="marketplace-tabs" aria-label="Piactér kategóriák">
        <Link className={marketTab === "auctions" ? "is-active" : ""} aria-current={marketTab === "auctions" ? "page" : undefined} to="/marketplace?tab=auctions">Aukciók</Link>
        <Link className={marketTab === "cards" ? "is-active" : ""} aria-current={marketTab === "cards" ? "page" : undefined} to="/marketplace?tab=cards">Lapok</Link>
        <Link className={marketTab === "bundles" ? "is-active" : ""} aria-current={marketTab === "bundles" ? "page" : undefined} to="/marketplace?tab=bundles">Csomagok / boosterek és kiegészítők</Link>
      </nav>

      <button
        className="marketplace-filter-toggle side-panel"
        type="button"
        aria-label={`Keresés és szűrés – ${appliedFilterEntries.length} aktív szűrő`}
        aria-expanded={filtersOpen}
        aria-controls="auction-filter-panel"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        <span><span aria-hidden="true">⌕</span> Keresés és szűrők <span aria-hidden="true">{filtersOpen ? "▴" : "▾"}</span></span>
        <span className="filter-count" aria-label={`${appliedFilterEntries.length} aktív szűrő`}>{appliedFilterEntries.length}</span>
      </button>
      <form id="auction-filter-panel" className="filter-panel side-panel" onSubmit={submitFilters} hidden={!filtersOpen}>
        {isAuthenticated && visibleSavedSearches.length ? <div className="saved-search-strip filter-wide" aria-label="Mentett keresések">
          <strong>Mentett keresések</strong>
          <div className="filter-quick-chips">
            {visibleSavedSearches.slice(0, 4).map((item) => (
              <button className={selectedSavedSearchId === item.id ? "is-active saved-search-chip" : "saved-search-chip"} type="button" title={item.name} aria-pressed={selectedSavedSearchId === item.id} onClick={() => applySavedSearch(item)} key={item.id}>{item.name.slice(0, 24)}</button>
            ))}
            {visibleSavedSearches.length > 4 ? <div className="saved-search-more">
              <button type="button" className={visibleSavedSearches.slice(4).some((item) => item.id === selectedSavedSearchId) ? "is-active" : ""} aria-expanded={showMoreSavedSearches} onClick={() => setShowMoreSavedSearches((open) => !open)}>Továbbiak</button>
              {showMoreSavedSearches ? <div className="saved-search-more-menu">
                {visibleSavedSearches.slice(4).map((item) => <button className={selectedSavedSearchId === item.id ? "is-active saved-search-chip" : "saved-search-chip"} type="button" title={item.name} aria-pressed={selectedSavedSearchId === item.id} onClick={() => applySavedSearch(item)} key={item.id}>{item.name.slice(0, 24)}</button>)}
              </div> : null}
            </div> : null}
          </div>
        </div> : null}
        {marketTab === "auctions" ? <div className="filter-quick-chips filter-wide" aria-label="Gyorsszűrők">
          <button className={filters.soon_ending ? "is-active" : ""} type="button" aria-pressed={filters.soon_ending} onClick={() => setFilters({ ...filters, soon_ending: !filters.soon_ending })}>24 órán belül lejár</button>
          <button className={filters.new_only ? "is-active" : ""} type="button" aria-pressed={filters.new_only} onClick={() => setFilters({ ...filters, new_only: !filters.new_only })}>Az elmúlt 7 nap új aukciói</button>
        </div> : null}
        <label className="filter-wide">
          Gyorskeresés
          <input type="search" maxLength={180} placeholder={marketTab === "cards" ? "Lapnév vagy HKK ID" : marketTab === "bundles" ? "Csomag, booster vagy kiegészítő neve" : "Cím vagy leírás"} value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
        </label>
        {marketTab !== "cards" ? <label>{marketTab === "bundles" ? "Terméknév" : "Cím"}<input type="search" maxLength={180} value={filters.title} onChange={(event) => setFilters({ ...filters, title: event.target.value })} /></label> : null}
        {marketTab !== "cards" ? <label>Leírás<input type="search" maxLength={180} value={filters.description} onChange={(event) => setFilters({ ...filters, description: event.target.value })} /></label> : null}
        <label>Eladó<input type="search" maxLength={80} value={filters.seller} onChange={(event) => setFilters({ ...filters, seller: event.target.value })} /></label>
        <label>
          Kategória
          <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value, hatalom_era: event.target.value === "Hatalom Kártyái Kártyajáték" ? filters.hatalom_era : "" })}>
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
        {filters.category === "Hatalom Kártyái Kártyajáték" ? <label>
          Hatalom-korszak
          <select value={filters.hatalom_era} onChange={(event) => setFilters({ ...filters, hatalom_era: event.target.value as HatalomEra | "" })}>
            <option value="">Mind</option>
            <option value="retro">RETRO</option>
            <option value="ujkor">Újkor</option>
            <option value="uj_nemzedek">Új nemzedék</option>
          </select>
        </label> : null}
        {marketTab !== "auctions" ? <label>Lapváltozat<select value={filters.variant} onChange={(event) => setFilters({ ...filters, variant: event.target.value as FilterState["variant"] })}><option value="">Mind</option><option value="normal">Normál</option><option value="foil">Foil</option><option value="fa">FA</option><option value="gfa">GFA</option></select></label> : null}
        <label>
          Minimum ár
          <input type="number" min="0" value={filters.min_price} onChange={(event) => setFilters({ ...filters, min_price: event.target.value })} />
        </label>
        <label>
          Maximum ár
          <input type="number" min="0" value={filters.max_price} onChange={(event) => setFilters({ ...filters, max_price: event.target.value })} />
        </label>
        {marketTab === "auctions" ? <label>
          Minimum licitszám
          <input type="number" min="0" value={filters.min_bids} onChange={(event) => setFilters({ ...filters, min_bids: event.target.value })} />
        </label> : null}
        {marketTab === "auctions" ? <label>
          Villámár
          <select value={filters.buy_now} onChange={(event) => setFilters({ ...filters, buy_now: event.target.value })}>
            <option value="">Mind</option>
            <option value="true">Csak villámáras</option>
            <option value="false">Villámár nélkül</option>
          </select>
        </label> : null}
        <label>
          Rendezés
          <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
            {SORT_OPTIONS.filter(([value]) => marketTab === "auctions" || !["most_bids", "fewest_bids", "soon_ending", "buy_now_first"].includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        {marketTab === "auctions" ? <label className="toggle-row compact-toggle">
          <input type="checkbox" checked={filters.soon_ending} onChange={(event) => setFilters({ ...filters, soon_ending: event.target.checked })} />
          Hamarosan lejár
        </label> : null}
        {marketTab === "auctions" ? <label className="toggle-row compact-toggle">
          <input type="checkbox" checked={filters.new_only} onChange={(event) => setFilters({ ...filters, new_only: event.target.checked })} />
          Új aukciók
        </label> : null}
        <div className="filter-actions">
          <button className="button button-secondary" type="button" onClick={resetFilters}>Alaphelyzet</button>
          <button className="button button-primary" type="submit">Szűrők alkalmazása</button>
          {isAuthenticated ? <button className="button button-ghost" type="button" onClick={saveSearch}>Keresés mentése</button> : null}
          {isAuthenticated ? <button className="button button-danger" type="button" disabled={selectedSavedSearchId === null} onClick={() => void removeSelectedSearch()}>Keresés törlése</button> : null}
        </div>
      </form>
      {saveMessage ? <p className="form-message" role="status">{saveMessage}</p> : null}

      <div ref={resultsRef} className="auction-results-start" tabIndex={-1}>
        {appliedFilterEntries.length > 0 ? <div className="active-filter-summary" aria-label="Aktív szűrők">
          <div className="active-filter-chips">
            {appliedFilterEntries.map((item) => <button type="button" className="active-filter-chip" aria-label={`${item.label} eltávolítása`} onClick={() => removeAppliedFilter(item.key)} key={item.key}>{item.label}<span aria-hidden="true"> ×</span></button>)}
          </div>
          <button className="button button-ghost" type="button" onClick={resetFilters}>Szűrők törlése</button>
        </div> : null}

      <div className="marketplace-results-toolbar">
        <span className="marketplace-results-count">{!isLoading && !error ? `${total} találat` : "Találatok"}</span>
        <CardViewSwitch label="Piactér megjelenítése" value={displayMode} onChange={changeDisplayMode} />
      </div>

      {isLoading ? <LoadingState label="Aukciók betöltése" cards={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && !error && auctions.length === 0 ? <EmptyState title={`Nincs a szűrésnek megfelelő ${marketTab === "auctions" ? "aukció" : marketTab === "cards" ? "lap" : "csomag, booster vagy kiegészítő"}.`} action={<button className="button button-secondary" type="button" onClick={resetFilters}>Szűrők törlése</button>} /> : null}

      <div className={marketTab === "auctions"
        ? `nv-bids-grid marketplace-live-grid ${displayMode === "list" ? "is-list" : ""} ${auctions.length % 2 ? "nv-bids-grid-odd" : ""}`.trim()
        : displayMode === "grid" ? "auction-grid page-grid marketplace-results-grid" : "marketplace-results-list"} aria-busy={isLoading}>
        {auctions.map((auction, index) => <AuctionCard
          item={toAuctionCardItem(auction)}
          index={index}
          detailPath={`/auctions/${auction.id}`}
          variant={marketTab === "auctions" ? "live" : "standard"}
          key={auction.id}
        />)}
      </div>

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
