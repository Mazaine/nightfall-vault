import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../api/client";
import { expressTradeInterest, getPublicTradeFolder, type PublicTradeCard } from "../api/vault";
import { CardImagePreview } from "../components/CardImagePreview";
import { formatHkkRarity } from "../utils/hkk";

const printVariantLabels = { normal: "Normál", foil: "Foil", fa: "FA – Full Art", gfa: "GFA – Golden Full Art" } as const;

export function PublicTradeFolderPage() {
  const { username = "" } = useParams();
  const [cards, setCards] = useState<PublicTradeCard[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const load = (value = "") => getPublicTradeFolder(username, value).then(setCards).catch((error) => setMessage(error instanceof ApiError ? error.message : "A cseremappa nem tölthető be."));
  useEffect(() => { void load(); }, [username]);
  const submit = (event: FormEvent) => { event.preventDefault(); void load(query.trim()); };
  return <section className="container page-shell public-trade-page"><header className="section-heading"><div><p className="eyebrow">Publikus cseremappa</p><h1>@{username}</h1><p>A kártyák stabil HKK-azonosító alapján vesznek részt a matchingben.</p></div><Link className="button button-ghost" to="/vault">Saját mappám</Link></header>
    <form className="vault-public-search" onSubmit={submit}><label className="visually-hidden" htmlFor="public-trade-search">Keresés a cseremappában</label><input id="public-trade-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lap neve…" /><button className="button button-secondary">Szűrés</button></form>{message ? <p role="status" className="form-message">{message}</p> : null}
    <div className="vault-card-grid">{cards.map((card) => <article className="vault-card" key={card.id}><CardImagePreview card={card}/><div className="vault-card-body"><div><strong>{card.card_name}</strong><span className="playset-badge">{card.quantity} db</span></div><small>{[card.edition, card.card_type, formatHkkRarity(card.rarity), printVariantLabels[card.print_variant || "normal"]].filter(Boolean).join(" · ")}</small><button className="button button-primary" onClick={() => void expressTradeInterest(card.id).then(() => setMessage("Az egyeztetés elindult. A Match-ek fülön folytathatod.")).catch((error) => setMessage(error instanceof ApiError ? error.message : "Nem sikerült elindítani az egyeztetést."))}>Érdekel</button></div></article>)}</div>{!cards.length ? <p className="empty-state">Nincs a szűrésnek megfelelő publikus cserelap.</p> : null}</section>;
}
