import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiAssetUrl } from "../api/client";
import { listMyAuctionConversations, type AuctionConversation } from "../api/auctions";
import { ErrorState, LoadingState } from "../components/AsyncStates";
import { SafeImage } from "../components/SafeImage";
import { formatLocalDateTime } from "../utils/format";

export function AccountConversationsPage() {
  const [items, setItems] = useState<AuctionConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setIsLoading(true);
    setError("");
    listMyAuctionConversations()
      .then(setItems)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  if (isLoading) return <LoadingState label="Üzenetek betöltése" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return <section className="account-section">
    <p className="eyebrow">Kapcsolatfelvétel</p>
    <h1>Üzeneteim</h1>
    <p>A lezárt aukciók eladó–nyertes beszélgetései.</p>
    <div className="marketplace-boundary-note" role="note">
      A Nightfall Vault nem kezel fizetést, rendelést vagy szállítást. Ezek részleteit a másik féllel közvetlenül, saját felelősségre beszélitek meg.
    </div>
    {items.length === 0 ? <div className="side-panel empty-state">
      <h2>Még nincs aukciós beszélgetésed</h2>
      <p>Üzenetet egy sikeresen lezárt aukció eladója és nyertese válthat egymással.</p>
      <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>
    </div> : <div className="conversation-list">
      {items.map((item) => <article className="side-panel conversation-card" key={item.auction_id}>
        {item.auction_image_url ? <SafeImage src={apiAssetUrl(item.auction_image_url)} alt="" loading="lazy" width={700} height={700} fallbackClassName="conversation-image-placeholder" /> : <div className="conversation-image-placeholder" aria-hidden="true" />}
        <div className="conversation-copy">
          <span className="status-badge">{item.role === "seller" ? "Eladóként" : "Nyertesként"}</span>
          <h2>{item.auction_title}</h2>
          <p>Másik fél: <Link to={`/users/${item.counterparty.username}`}>{item.counterparty.full_name}</Link></p>
          {item.last_message ? <p className="conversation-preview">{item.last_message}</p> : <p className="conversation-preview">Még nincs üzenet. Kezdd el az egyeztetést.</p>}
          <small>{item.last_message_at ? `Utolsó üzenet: ${formatLocalDateTime(item.last_message_at)}` : `Lezárva: ${formatLocalDateTime(item.finalized_at)}`}</small>
          <div><Link className="button button-primary" to={`/auctions/${item.auction_id}#auction-conversation`}>Beszélgetés megnyitása</Link></div>
        </div>
      </article>)}
    </div>}
  </section>;
}
