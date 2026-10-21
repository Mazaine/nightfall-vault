import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../AuthContext";
import { ApiError } from "../api/client";
import { expressTradeInterest, getCommunityTradeFilterOptions, listCommunityTradeCards, listCommunityTradeOffers, listCommunityTradeOwners, listCommunityWantedOverlap, type CommunityTradeCard, type CommunityTradeFilters, type CommunityTradeOwner, type CommunityTradePage, type PrintVariant, type PublicTradeCard } from "../api/vault";
import { CardImagePreview } from "../components/CardImagePreview";
import { MultiValueFilter } from "../components/MultiValueFilter";
import { formatHkkRarity } from "../utils/hkk";

type BrowserFilters = Required<Pick<CommunityTradeFilters, "query" | "editions" | "rarities" | "colors" | "cardTypes" | "variants" | "minQuantity" | "sort" | "view" | "onlyWanted" | "mutualMatch">> & { ownerId?: number };
type SavedSearch = { id: string; name: string; filters: BrowserFilters };
const EMPTY_FILTERS: BrowserFilters = { query: "", editions: [], rarities: [], colors: [], cardTypes: [], variants: [], minQuantity: 1, sort: "name", view: "cards", onlyWanted: false, mutualMatch: false };
const VARIANT_LABELS: Record<PrintVariant, string> = { normal: "Normál", foil: "Foil", fa: "FA", gfa: "GFA" };
const CARD_DISPLAY_MODE_KEY = "nightfall-vault-card-display-mode";
const csv = (value: string | null) => value?.split(",").filter(Boolean) || [];

function filtersFromUrl(search: URLSearchParams): BrowserFilters {
  return { ...EMPTY_FILTERS, query: search.get("q") || "", ownerId: Number(search.get("owner")) || undefined, editions: csv(search.get("editions")), rarities: csv(search.get("rarities")), colors: csv(search.get("colors")), cardTypes: csv(search.get("types")), variants: csv(search.get("variants")) as PrintVariant[], minQuantity: Math.max(1, Number(search.get("min")) || 1), sort: (search.get("sort") as BrowserFilters["sort"]) || "name", view: search.get("view") === "players" ? "players" : "cards", onlyWanted: search.get("wanted") === "1", mutualMatch: search.get("mutual") === "1" };
}
function filtersToUrl(filters: BrowserFilters) {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.ownerId) search.set("owner", String(filters.ownerId));
  if (filters.editions.length) search.set("editions", filters.editions.join(","));
  if (filters.rarities.length) search.set("rarities", filters.rarities.join(","));
  if (filters.colors.length) search.set("colors", filters.colors.join(","));
  if (filters.cardTypes.length) search.set("types", filters.cardTypes.join(","));
  if (filters.variants.length) search.set("variants", filters.variants.join(","));
  if (filters.minQuantity > 1) search.set("min", String(filters.minQuantity));
  if (filters.sort !== "name") search.set("sort", filters.sort);
  if (filters.view !== "cards") search.set("view", filters.view);
  if (filters.onlyWanted) search.set("wanted", "1");
  if (filters.mutualMatch) search.set("mutual", "1");
  return search;
}
function initialFilters(search: URLSearchParams): BrowserFilters {
  if ([...search.keys()].length) return filtersFromUrl(search);
  try { return { ...EMPTY_FILTERS, ...JSON.parse(localStorage.getItem("nightfall-community-last-filters") || "{}") }; }
  catch { return EMPTY_FILTERS; }
}

export function CommunityTradeBrowserPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [urlSearch, setUrlSearch] = useSearchParams();
  const [data, setData] = useState<CommunityTradePage>({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [filters, setFilters] = useState<BrowserFilters>(() => initialFilters(urlSearch));
  const [applied, setApplied] = useState<BrowserFilters>(() => initialFilters(urlSearch));
  const [options, setOptions] = useState({ editions: [] as string[], rarities: [] as string[], colors: [] as string[], card_types: [] as string[] });
  const [owners, setOwners] = useState<CommunityTradeOwner[]>([]);
  const [offers, setOffers] = useState<CommunityTradeCard[] | null>(null);
  const [offersFor, setOffersFor] = useState<CommunityTradeCard | null>(null);
  const [overlap, setOverlap] = useState<{ ownerId: number; cards: PublicTradeCard[] } | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const storageKey = `nightfall-community-searches:${user?.id || "guest"}`;
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedName, setSavedName] = useState("");
  const [displayMode, setDisplayMode] = useState<"grid" | "list">(() => localStorage.getItem(CARD_DISPLAY_MODE_KEY) === "list" ? "list" : "grid");
  const [renamingSearchId, setRenamingSearchId] = useState<string | null>(null);
  const [renamingSearchName, setRenamingSearchName] = useState("");

  useEffect(() => { void Promise.all([getCommunityTradeFilterOptions().then(setOptions), listCommunityTradeOwners().then(setOwners)]).catch(() => setMessage("A szűrőadatok egy része nem tölthető be.")); }, [user?.id]);
  useEffect(() => { try { setSavedSearches(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { setSavedSearches([]); } }, [storageKey]);
  useEffect(() => { localStorage.setItem("nightfall-community-last-filters", JSON.stringify(applied)); }, [applied]);
  const load = (page = 1, values = applied) => { setLoading(true); setMessage(""); return listCommunityTradeCards({ ...values, page, pageSize: 20 }).then(setData).catch((error) => setMessage(error instanceof ApiError ? error.message : "A cseremappák nem tölthetők be.")).finally(() => setLoading(false)); };
  useEffect(() => { void load(1, applied); }, [applied]);

  const submit = (event: FormEvent) => { event.preventDefault(); setApplied({ ...filters }); setUrlSearch(filtersToUrl(filters)); };
  const clear = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setUrlSearch(new URLSearchParams()); };
  const startTrade = async (cardId: number) => {
    if (!isAuthenticated) { navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    try { await expressTradeInterest(cardId); navigate("/vault?area=trade&view=matches"); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : "Nem sikerült elindítani az egyeztetést."); }
  };
  const showOffers = async (card: CommunityTradeCard) => { setOffersFor(card); setOffers(null); setOverlap(null); try { setOffers(await listCommunityTradeOffers(card.external_card_id, card.edition)); } catch (error) { setOffers([]); setMessage(error instanceof ApiError ? error.message : "Az ajánlatok nem tölthetők be."); } };
  const showOverlap = async (ownerId: number) => {
    if (!isAuthenticated) { navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    try { setOverlap({ ownerId, cards: await listCommunityWantedOverlap(ownerId) }); } catch (error) { setMessage(error instanceof ApiError ? error.message : "A felajánlható lapok nem tölthetők be."); }
  };
  const saveSearch = () => {
    if (!isAuthenticated) { navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    const name = savedName.trim(); if (!name) { setMessage("Adj nevet a mentett keresésnek."); return; }
    const next = [...savedSearches, { id: crypto.randomUUID(), name, filters: applied }]; setSavedSearches(next); localStorage.setItem(storageKey, JSON.stringify(next));
    setSavedName("");
  };
  const renameSearch = (saved: SavedSearch) => {
    const name = renamingSearchName.trim();
    if (!name) { setMessage("A mentett keresés neve nem lehet üres."); return; }
    const next = savedSearches.map((item) => item.id === saved.id ? { ...item, name } : item);
    setSavedSearches(next); localStorage.setItem(storageKey, JSON.stringify(next));
    setRenamingSearchId(null); setRenamingSearchName("");
  };
  const activeFilterCount = useMemo(() => applied.editions.length + applied.rarities.length + applied.colors.length + applied.cardTypes.length + applied.variants.length + Number(Boolean(applied.query || applied.ownerId || applied.onlyWanted || applied.mutualMatch || applied.minQuantity > 1)), [applied]);
  const playerGroups = useMemo(() => {
    const groups = new Map<number, { name: string; username: string; cards: CommunityTradeCard[] }>();
    data.items.forEach((card) => {
      const group: { name: string; username: string; cards: CommunityTradeCard[] } = groups.get(card.owner_id) || { name: card.owner_username, username: card.owner_username, cards: [] };
      group.cards.push(card); groups.set(card.owner_id, group);
    });
    return [...groups.entries()];
  }, [data.items]);
  const changeDisplayMode = (mode: "grid" | "list") => { setDisplayMode(mode); localStorage.setItem(CARD_DISPLAY_MODE_KEY, mode); };
  const renderCard = (card: CommunityTradeCard) => displayMode === "grid" ? <article className="vault-card" key={`${card.id}-${card.external_card_id}-${card.edition}`}><CardImagePreview card={card} preview={false}/><div className="vault-card-body"><div className="community-trade-badges">{card.is_wanted ? <span>Keresett lapod</span> : null}{card.is_match ? <span className="is-match">Match</span> : null}</div><strong>{card.card_name}</strong><small>{[card.edition, card.card_type, formatHkkRarity(card.rarity)].filter(Boolean).join(" · ")}</small><p>#{card.external_card_id} · {card.total_quantity || card.quantity} db</p><p className="community-variant-summary">{Object.entries(card.variant_quantities || {}).map(([variant, quantity]) => `${VARIANT_LABELS[variant as PrintVariant]} ${quantity}`).join(" · ")}</p>{card.grouped ? <><p>{card.offer_count} játékos kínálja</p><button type="button" className="button button-primary" onClick={() => void showOffers(card)}>Ajánlatok megtekintése</button></> : <><p><Link to={`/vault/users/${encodeURIComponent(card.owner_username)}`}>@{card.owner_username}</Link>{card.owner_rating ? ` · ★ ${card.owner_rating.toFixed(1)} (${card.owner_rating_count})` : ""}</p><button type="button" className="button button-ghost" onClick={() => void showOverlap(card.owner_id)}>Mit tudok adni érte?</button><button type="button" className="button button-primary" onClick={() => void startTrade(card.id)}>Érdekel</button></>}</div></article> : <article className="vault-trade-list-row community-trade-list-row" key={`${card.id}-${card.external_card_id}-${card.edition}`}><CardImagePreview card={card} className="vault-trade-list-image"/><div className="vault-trade-list-info"><div className="community-trade-badges">{card.is_wanted ? <span>Keresett lapod</span> : null}{card.is_match ? <span className="is-match">Match</span> : null}</div><strong>{card.card_name}</strong><small>{[card.edition, card.card_type, formatHkkRarity(card.rarity)].filter(Boolean).join(" · ")}</small><span>#{card.external_card_id} · {card.total_quantity || card.quantity} db · {Object.entries(card.variant_quantities || {}).map(([variant, quantity]) => `${VARIANT_LABELS[variant as PrintVariant]} ${quantity}`).join(" · ")}</span></div><footer className="vault-trade-list-actions">{card.grouped ? <button type="button" className="button button-primary" onClick={() => void showOffers(card)}>Ajánlatok ({card.offer_count})</button> : <><button type="button" className="button button-ghost" onClick={() => void showOverlap(card.owner_id)}>Mit adhatok?</button><button type="button" className="button button-primary" onClick={() => void startTrade(card.id)}>Érdekel</button></>}</footer></article>;

  return <section className="container page-shell community-trade-page">
    <header className="section-heading"><div><p className="eyebrow">Cseremappák</p><h1>Nyilvános cserelapok</h1><p>Minden publikus ajánlat böngészhető. A Keresem és Match jelzés segítség, nem belépési feltétel.</p></div>{isAuthenticated ? <Link className="button button-ghost" to="/vault?area=trade">Saját cseréim</Link> : <Link className="button button-primary" to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Belépés</Link>}</header>
    <div className="community-view-tabs" role="tablist" aria-label="Cseremappa nézet"><button type="button" role="tab" aria-selected={filters.view === "cards"} onClick={() => setFilters((current) => ({ ...current, view: "cards" }))}>Összes lap</button><button type="button" role="tab" aria-selected={filters.view === "players"} onClick={() => setFilters((current) => ({ ...current, view: "players" }))}>Játékosok mappái</button></div>
    <form className="community-trade-filters" onSubmit={submit}>
      <label>Lap vagy HKK ID<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Keresés…"/></label>
      <label>Felhasználó<select value={filters.ownerId || ""} onChange={(event) => setFilters((current) => ({ ...current, ownerId: Number(event.target.value) || undefined }))}><option value="">Összes felhasználó</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.display_name} ({owner.card_count})</option>)}</select></label>
      <MultiValueFilter label="Kiegészítő" options={options.editions.map((value) => ({ value }))} selected={filters.editions} onChange={(editions) => setFilters((current) => ({ ...current, editions }))}/>
      <MultiValueFilter label="Gyakoriság" options={options.rarities.map((value) => ({ value, label: formatHkkRarity(value) || value }))} selected={filters.rarities} onChange={(rarities) => setFilters((current) => ({ ...current, rarities }))}/>
      <MultiValueFilter label="Szín" options={options.colors.map((value) => ({ value }))} selected={filters.colors} onChange={(colors) => setFilters((current) => ({ ...current, colors }))}/>
      <MultiValueFilter label="Laptípus" options={options.card_types.map((value) => ({ value }))} selected={filters.cardTypes} onChange={(cardTypes) => setFilters((current) => ({ ...current, cardTypes }))}/>
      <MultiValueFilter label="Változat" options={(Object.keys(VARIANT_LABELS) as PrintVariant[]).map((value) => ({ value, label: VARIANT_LABELS[value] }))} selected={filters.variants} onChange={(variants) => setFilters((current) => ({ ...current, variants: variants as PrintVariant[] }))}/>
      <label>Minimum darabszám<input type="number" min="1" max="999" value={filters.minQuantity} onChange={(event) => setFilters((current) => ({ ...current, minQuantity: Math.max(1, Number(event.target.value)) }))}/></label>
      <label>Rendezés<select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as BrowserFilters["sort"] }))}><option value="name">Név</option><option value="edition">Kiegészítő</option><option value="rarity">Gyakoriság</option><option value="updated">Legutóbb frissítve</option></select></label>
      <label className="community-quick-filter"><input type="checkbox" disabled={!isAuthenticated} checked={filters.onlyWanted} onChange={(event) => setFilters((current) => ({ ...current, onlyWanted: event.target.checked }))}/>Csak amit keresek</label>
      <label className="community-quick-filter"><input type="checkbox" disabled={!isAuthenticated} checked={filters.mutualMatch} onChange={(event) => setFilters((current) => ({ ...current, mutualMatch: event.target.checked }))}/>Csak kölcsönös Match</label>
      <div className="community-filter-actions"><button className="button button-primary">Szűrés</button><button type="button" className="button button-ghost" onClick={clear}>Szűrők törlése</button><label>Mentés neve<input value={savedName} onChange={(event) => setSavedName(event.target.value)} placeholder="pl. 2022-es ritkák" maxLength={80}/></label><button type="button" className="button button-ghost" onClick={saveSearch}>Keresés mentése</button></div>
    </form>
    {savedSearches.length ? <div className="community-saved-searches"><strong>Mentett keresések</strong>{savedSearches.map((saved) => <span key={saved.id}>{renamingSearchId === saved.id ? <><input aria-label={`${saved.name} új neve`} value={renamingSearchName} maxLength={80} autoFocus onChange={(event) => setRenamingSearchName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameSearch(saved); if (event.key === "Escape") setRenamingSearchId(null); }}/><button type="button" onClick={() => renameSearch(saved)}>Mentés</button></> : <><button type="button" onClick={() => { setFilters(saved.filters); setApplied(saved.filters); setUrlSearch(filtersToUrl(saved.filters)); }}>{saved.name}</button><button type="button" aria-label={`${saved.name} átnevezése`} onClick={() => { setRenamingSearchId(saved.id); setRenamingSearchName(saved.name); }}>✎</button></>}<button type="button" aria-label={`${saved.name} törlése`} onClick={() => { const next = savedSearches.filter((item) => item.id !== saved.id); setSavedSearches(next); localStorage.setItem(storageKey, JSON.stringify(next)); }}>×</button></span>)}</div> : null}
    <div className="community-trade-summary"><strong>{data.total} találat{activeFilterCount ? ` · ${activeFilterCount} aktív szűrő` : ""}</strong><div className="vault-view-switch" role="group" aria-label="Cseremappák megjelenítése"><button type="button" aria-pressed={displayMode === "grid"} className={displayMode === "grid" ? "is-active" : ""} onClick={() => changeDisplayMode("grid")}>Rács</button><button type="button" aria-pressed={displayMode === "list"} className={displayMode === "list" ? "is-active" : ""} onClick={() => changeDisplayMode("list")}>Lista</button></div>{message ? <span role="status" className="form-message">{message}</span> : null}</div>
    {loading ? <p className="empty-state">Cserelapok betöltése…</p> : applied.view === "players" ? <div className="community-player-groups">{playerGroups.map(([ownerId, group]) => <section key={ownerId}><header><div><h2>{group.name}</h2><Link to={`/vault/users/${encodeURIComponent(group.username)}`}>@{group.username}</Link></div><span>{group.cards.length} cserelap</span></header><div className={displayMode === "grid" ? "vault-card-grid community-trade-grid" : "vault-trade-list community-trade-list"}>{group.cards.map(renderCard)}</div></section>)}</div> : <div className={displayMode === "grid" ? "vault-card-grid community-trade-grid" : "vault-trade-list community-trade-list"}>{data.items.map(renderCard)}</div>}
    {!loading && !data.items.length ? <p className="empty-state">Nincs a szűrésnek megfelelő publikus cserelap.</p> : null}
    {data.total_pages > 1 ? <nav className="pagination" aria-label="Cserelap oldalak"><button type="button" className="button button-ghost" disabled={data.page <= 1 || loading} onClick={() => void load(data.page - 1)}>Előző</button><span>{data.page} / {data.total_pages}</span><button type="button" className="button button-ghost" disabled={data.page >= data.total_pages || loading} onClick={() => void load(data.page + 1)}>Következő</button></nav> : null}
    {offersFor ? <div className="vault-confirm-backdrop"><section className="vault-confirm-dialog community-offers-dialog" role="dialog" aria-modal="true" aria-label={`${offersFor.card_name} ajánlatai`}><header><div><h2>{offersFor.card_name}</h2><p>{offers === null ? "Ajánlatok betöltése…" : `${offers.length} aktív ajánlat`}</p></div><button type="button" className="button button-ghost" onClick={() => { setOffersFor(null); setOffers(null); setOverlap(null); }}>Bezárás</button></header>{offers?.length === 0 ? <p className="empty-state">Az ajánlat időközben megszűnt.</p> : <div className="community-offer-list">{offers?.map((offer) => <article key={offer.id}><CardImagePreview card={offer} preview={false}/><div><strong>@{offer.owner_username}</strong><span>{VARIANT_LABELS[offer.print_variant]} · {offer.quantity} db</span>{offer.owner_rating ? <span>★ {offer.owner_rating.toFixed(1)} ({offer.owner_rating_count})</span> : null}</div><button type="button" className="button button-ghost" onClick={() => void showOverlap(offer.owner_id)}>Mit tudok adni érte?</button><button type="button" className="button button-primary" onClick={() => void startTrade(offer.id)}>Érdekel</button></article>)}</div>}{overlap ? <aside className="community-overlap"><h3>Amit a partner keres és nálad cserére elérhető</h3>{overlap.cards.length ? <ul>{overlap.cards.map((card) => <li key={card.id}>{card.card_name} · {VARIANT_LABELS[card.print_variant]} · {card.quantity} db</li>)}</ul> : <p>Nincs közvetlen átfedés, de ettől még küldhetsz több lapos ajánlatot.</p>}</aside> : null}</section></div> : null}
  </section>;
}
