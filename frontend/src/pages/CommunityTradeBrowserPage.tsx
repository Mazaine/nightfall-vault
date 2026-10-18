import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../AuthContext";
import { ApiError } from "../api/client";
import { expressTradeInterest, listCommunityTradeCards, type CommunityTradePage, type PrintVariant } from "../api/vault";
import { CardImagePreview } from "../components/CardImagePreview";
import { formatHkkRarity } from "../utils/hkk";

const VARIANTS: { value: PrintVariant | ""; label: string }[] = [
  { value: "", label: "Minden változat" }, { value: "normal", label: "Normál" },
  { value: "foil", label: "Foil" }, { value: "fa", label: "FA" }, { value: "gfa", label: "GFA" },
];

export function CommunityTradeBrowserPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CommunityTradePage>({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
  const [filters, setFilters] = useState({ query: "", edition: "", owner: "", printVariant: "" as PrintVariant | "" });
  const [applied, setApplied] = useState(filters);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (page = 1, values = applied) => {
    setLoading(true);
    setMessage("");
    return listCommunityTradeCards({ ...values, page, pageSize: 20 })
      .then(setData)
      .catch((error) => setMessage(error instanceof ApiError ? error.message : "A közösségi cseremappa nem tölthető be."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { void load(1, applied); }, [applied]);

  const submit = (event: FormEvent) => { event.preventDefault(); setApplied({ ...filters }); };
  const startTrade = async (cardId: number) => {
    try {
      await expressTradeInterest(cardId);
      navigate("/vault?area=trade&view=matches");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Nem sikerült elindítani az egyeztetést.");
    }
  };

  return <section className="container page-shell community-trade-page">
    <header className="section-heading"><div><p className="eyebrow">Közösségi Cseremappa</p><h1>Nyilvános cserelapok</h1><p>A böngésző minden publikus ajánlatot mutat. A Keresem és Match jelzések csak segítséget adnak, nem szűrik a kínálatot.</p></div>{isAuthenticated ? <Link className="button button-ghost" to="/vault?area=trade">Saját cseréim</Link> : <Link className="button button-primary" to="/login?next=%2Fvault%2Fcommunity">Belépés</Link>}</header>
    <form className="community-trade-filters" onSubmit={submit}>
      <label>Lap vagy HKK ID<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Keresés…"/></label>
      <label>Kiegészítő<input value={filters.edition} onChange={(event) => setFilters((current) => ({ ...current, edition: event.target.value }))} placeholder="Kiegészítő…"/></label>
      <label>Felhasználó<input value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))} placeholder="Felhasználónév…"/></label>
      <label>Változat<select value={filters.printVariant} onChange={(event) => setFilters((current) => ({ ...current, printVariant: event.target.value as PrintVariant | "" }))}>{VARIANTS.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}</select></label>
      <button className="button button-primary">Szűrés</button>
      <button type="button" className="button button-ghost" onClick={() => { const empty = { query: "", edition: "", owner: "", printVariant: "" as PrintVariant | "" }; setFilters(empty); setApplied(empty); }}>Törlés</button>
    </form>
    <div className="community-trade-summary"><strong>{data.total} publikus cserelap</strong>{message ? <span role="status" className="form-message">{message}</span> : null}</div>
    {loading ? <p className="empty-state">Cserelapok betöltése…</p> : <div className="vault-card-grid community-trade-grid">{data.items.map((card) => <article className="vault-card" key={card.id}>
      <CardImagePreview card={card}/><div className="vault-card-body"><div className="community-trade-badges">{card.is_wanted ? <span>Keresett lapod</span> : null}{card.is_match ? <span className="is-match">Match</span> : null}</div><strong>{card.card_name}</strong><small>{[card.edition, card.card_type, formatHkkRarity(card.rarity), VARIANTS.find((item) => item.value === card.print_variant)?.label].filter(Boolean).join(" · ")}</small><p>#{card.external_card_id} · {card.quantity} db · <Link to={`/vault/users/${encodeURIComponent(card.owner_username)}`}>@{card.owner_username}</Link></p>{card.fixed_price_auction_id && card.fixed_price ? <Link className="vault-fixed-listing" to={`/auctions/${card.fixed_price_auction_id}`}><strong>{Number(card.fixed_price).toLocaleString("hu-HU")} Ft</strong><span>Fix áras hirdetés</span></Link> : null}
        {isAuthenticated ? <button type="button" className="button button-primary" disabled={!card.can_express_interest || user?.id === card.owner_id} onClick={() => void startTrade(card.id)}>{user?.id === card.owner_id ? "Saját lapod" : "Érdekel"}</button> : <Link className="button button-primary" to="/login?next=%2Fvault%2Fcommunity">Belépés az érdeklődéshez</Link>}
      </div></article>)}</div>}
    {!loading && !data.items.length ? <p className="empty-state">Nincs a szűrésnek megfelelő publikus cserelap.</p> : null}
    {data.total_pages > 1 ? <nav className="pagination" aria-label="Közösségi cserelap oldalak"><button type="button" className="button button-ghost" disabled={data.page <= 1 || loading} onClick={() => void load(data.page - 1)}>Előző</button><span>{data.page} / {data.total_pages}</span><button type="button" className="button button-ghost" disabled={data.page >= data.total_pages || loading} onClick={() => void load(data.page + 1)}>Következő</button></nav> : null}
  </section>;
}
