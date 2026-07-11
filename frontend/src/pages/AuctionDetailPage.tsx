import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiAssetUrl } from "../api/client";
import { createAuctionMessage, createAuctionReview, getAuction, listAuctionMessages, type Auction, type AuctionMessage } from "../api/auctions";
import { formatLocalDateTime, formatMoney, formatRemainingTime } from "../utils/format";

export function AuctionDetailPage() {
  const { auctionId } = useParams();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [messages, setMessages] = useState<AuctionMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [postAuctionMessage, setPostAuctionMessage] = useState("");

  useEffect(() => {
    if (!auctionId) {
      return;
    }
    getAuction(auctionId)
      .then((data) => {
        setAuction(data);
        if (data.can_chat) {
          listAuctionMessages(data.id).then(setMessages).catch(() => setMessages([]));
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [auctionId]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auction || !postAuctionMessage.trim()) {
      return;
    }
    const created = await createAuctionMessage(auction.id, postAuctionMessage);
    setMessages((items) => [...items, created]);
    setPostAuctionMessage("");
  };

  const sendReview = async (rating: number) => {
    if (!auction) {
      return;
    }
    await createAuctionReview(auction.id, rating, "Értékelés a sikeresen lezárt aukció után.");
    setAuction({ ...auction, can_review: false });
  };

  if (isLoading) {
    return <section className="container page-shell"><div className="side-panel">Aukció betöltése...</div></section>;
  }

  if (error || !auction) {
    return <section className="container page-shell"><div className="side-panel">{error || "Az aukció nem található."}</div></section>;
  }

  const coverImage = auction.images.find((image) => image.is_cover) ?? auction.images[0];

  return (
    <section className="container page-shell detail-layout">
      <div className="detail-media auction-image">
        {coverImage ? <img src={apiAssetUrl(coverImage.storage_key)} alt={auction.title} /> : null}
      </div>
      <div className="side-panel detail-panel">
        <p className="eyebrow">{auction.category} · {auction.status}</p>
        <h1>{auction.title}</h1>
        <p className="hero-lead">
          {auction.description}
        </p>
        <dl className="detail-list">
          <div><dt>Kezdőár</dt><dd>{formatMoney(auction.starting_price)}</dd></div>
          <div><dt>Licitlépcső</dt><dd>{formatMoney(auction.bid_increment)}</dd></div>
          <div><dt>Hátralévő idő</dt><dd>{formatRemainingTime(auction.ends_at, auction.status)}</dd></div>
          <div><dt>Kezdés</dt><dd>{formatLocalDateTime(auction.starts_at)}</dd></div>
          <div><dt>Zárás</dt><dd>{formatLocalDateTime(auction.ends_at)}</dd></div>
          <div><dt>Eladó</dt><dd>{auction.seller?.full_name ?? auction.seller?.username ?? "Eladó"}</dd></div>
          {auction.buy_now_enabled && auction.buy_now_price ? (
            <div><dt>Villámár</dt><dd>{formatMoney(auction.buy_now_price)}</dd></div>
          ) : null}
        </dl>
        <div className="hero-actions">
          <button className="button button-primary" type="button">Licitálok</button>
          <Link className="button button-ghost" to="/auctions">Vissza az aukciókhoz</Link>
        </div>

        {auction.can_chat ? (
          <section className="post-auction-panel">
            <h2>Kapcsolat a másik féllel</h2>
            <div className="message-list">
              {messages.map((message) => (
                <p key={message.id}>{message.message}</p>
              ))}
            </div>
            <form onSubmit={sendMessage}>
              <textarea value={postAuctionMessage} onChange={(event) => setPostAuctionMessage(event.target.value)} rows={3} />
              <button className="button button-secondary" type="submit">Üzenet küldése</button>
            </form>
          </section>
        ) : null}

        {auction.can_review ? (
          <section className="post-auction-panel">
            <h2>Értékelés</h2>
            <button className="button button-secondary" type="button" onClick={() => sendReview(5)}>5 csillagos értékelés küldése</button>
          </section>
        ) : null}
      </div>
    </section>
  );
}
