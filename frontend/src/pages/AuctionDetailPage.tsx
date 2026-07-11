import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiAssetUrl } from "../api/client";
import { createAuctionMessage, createAuctionReview, getAuction, listAuctionBids, listAuctionMessages, placeAuctionBid, type Auction, type AuctionBid, type AuctionMessage } from "../api/auctions";
import { formatLocalDateTime, formatMoney, formatRemainingTime } from "../utils/format";

export function AuctionDetailPage() {
  const { auctionId } = useParams();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [messages, setMessages] = useState<AuctionMessage[]>([]);
  const [bidHistory, setBidHistory] = useState<AuctionBid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [postAuctionMessage, setPostAuctionMessage] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [isBidSubmitting, setIsBidSubmitting] = useState(false);

  useEffect(() => {
    if (!auctionId) {
      return;
    }
    getAuction(auctionId)
      .then((data) => {
        setAuction(data);
        listAuctionBids(data.id).then(setBidHistory).catch(() => setBidHistory([]));
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

  const submitBid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auction || !bidAmount.trim()) {
      return;
    }
    setIsBidSubmitting(true);
    setBidMessage("");
    try {
      const createdBid = await placeAuctionBid(auction.id, bidAmount);
      const [refreshedAuction, refreshedBids] = await Promise.all([
        getAuction(auction.id),
        listAuctionBids(auction.id),
      ]);
      setAuction(refreshedAuction);
      setBidHistory(refreshedBids);
      setBidAmount("");
      setBidMessage(createdBid.reaches_buy_now ? "A licit elĂ©rte a villĂˇmĂˇrat. A lezĂˇrĂˇsi folyamat elĹ‘kĂ©szĂ­tve." : "A licit sikeresen rĂ¶gzĂ­tve.");
    } catch (error) {
      setBidMessage(error instanceof Error ? error.message : "A licit rĂ¶gzĂ­tĂ©se nem sikerĂĽlt.");
    } finally {
      setIsBidSubmitting(false);
    }
  };

  const sendReview = async (rating: number) => {
    if (!auction) {
      return;
    }
    await createAuctionReview(auction.id, rating, "Ă‰rtĂ©kelĂ©s a sikeresen lezĂˇrt aukciĂł utĂˇn.");
    setAuction({ ...auction, can_review: false });
  };

  if (isLoading) {
    return <section className="container page-shell"><div className="side-panel">AukciĂł betĂ¶ltĂ©se...</div></section>;
  }

  if (error || !auction) {
    return <section className="container page-shell"><div className="side-panel">{error || "Az aukciĂł nem talĂˇlhatĂł."}</div></section>;
  }

  const coverImage = auction.images.find((image) => image.is_cover) ?? auction.images[0];

  return (
    <section className="container page-shell detail-layout">
      <div className="detail-media auction-image">
        {coverImage ? <img src={apiAssetUrl(coverImage.storage_key)} alt={auction.title} /> : null}
      </div>
      <div className="side-panel detail-panel">
        <p className="eyebrow">{auction.category} Â· {auction.status}</p>
        <h1>{auction.title}</h1>
        <p className="hero-lead">
          {auction.description}
        </p>
        <dl className="detail-list">
          <div><dt>AktuĂˇlis licit</dt><dd>{formatMoney(auction.current_price ?? auction.starting_price)}</dd></div>
          <div><dt>KezdĹ‘Ăˇr</dt><dd>{formatMoney(auction.starting_price)}</dd></div>
          <div><dt>LicitlĂ©pcsĹ‘</dt><dd>{formatMoney(auction.bid_increment)}</dd></div>
          <div><dt>HĂˇtralĂ©vĹ‘ idĹ‘</dt><dd>{formatRemainingTime(auction.ends_at, auction.status)}</dd></div>
          <div><dt>KezdĂ©s</dt><dd>{formatLocalDateTime(auction.starts_at)}</dd></div>
          <div><dt>ZĂˇrĂˇs</dt><dd>{formatLocalDateTime(auction.ends_at)}</dd></div>
          <div><dt>EladĂł</dt><dd>{auction.seller?.full_name ?? auction.seller?.username ?? "EladĂł"}</dd></div>
          {auction.buy_now_enabled && auction.buy_now_price ? (
            <div><dt>VillĂˇmĂˇr</dt><dd>{formatMoney(auction.buy_now_price)}</dd></div>
          ) : null}
        </dl>
        {auction.status === "active" && !auction.is_owner ? (
          <form className="bid-panel" onSubmit={submitBid}>
            <label>
              Licit Ă¶sszege
              <input
                min="1"
                step="1"
                type="number"
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
                placeholder={String(Number(auction.current_price ?? auction.starting_price) + Number(auction.bid_increment))}
              />
            </label>
            <button className="button button-primary" type="submit" disabled={isBidSubmitting}>
              {isBidSubmitting ? "Licit rĂ¶gzĂ­tĂ©se..." : "LicitĂˇlok"}
            </button>
            {bidMessage ? <p className="form-message">{bidMessage}</p> : null}
          </form>
        ) : null}
        <div className="hero-actions">
          <Link className="button button-ghost" to="/auctions">Vissza az aukciĂłkhoz</Link>
        </div>

        <section className="post-auction-panel">
          <h2>LicittĂ¶rtĂ©net</h2>
          {bidHistory.length === 0 ? (
            <p>MĂ©g nincs licit ezen az aukciĂłn.</p>
          ) : (
            <div className="bid-history-list">
              {bidHistory.map((bid) => (
                <p key={bid.id}>
                  <strong>{formatMoney(bid.amount)}</strong>
                  <span>{bid.bidder_label}</span>
                  {bid.is_highest ? <em>Legmagasabb</em> : null}
                </p>
              ))}
            </div>
          )}
        </section>

        {auction.can_chat ? (
          <section className="post-auction-panel">
            <h2>Kapcsolat a mĂˇsik fĂ©llel</h2>
            <div className="message-list">
              {messages.map((message) => (
                <p key={message.id}>{message.message}</p>
              ))}
            </div>
            <form onSubmit={sendMessage}>
              <textarea value={postAuctionMessage} onChange={(event) => setPostAuctionMessage(event.target.value)} rows={3} />
              <button className="button button-secondary" type="submit">Ăśzenet kĂĽldĂ©se</button>
            </form>
          </section>
        ) : null}

        {auction.can_review ? (
          <section className="post-auction-panel">
            <h2>Ă‰rtĂ©kelĂ©s</h2>
            <button className="button button-secondary" type="button" onClick={() => sendReview(5)}>5 csillagos Ă©rtĂ©kelĂ©s kĂĽldĂ©se</button>
          </section>
        ) : null}
      </div>
    </section>
  );
}
