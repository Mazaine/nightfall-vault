import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiAssetUrl } from "../api/client";
import { auctionReportReasons, createAuctionReport } from "../api/reports";
import { useAuth } from "../AuthContext";
import { ReportDialog } from "../components/ReportDialog";
import { addWatchlistItem, auctionStreamUrl, createAuctionMessage, createAuctionReview, getAuction, listAuctionBids, listAuctionMessages, listRelatedAuctions, listSellerOtherAuctions, placeAuctionBid, listAuctionReviews, type Auction, type AuctionBid, type AuctionMessage, type AuctionRealtimeSnapshot, type AuctionReview } from "../api/auctions";
import { formatLocalDateTime, formatMoney, formatRemainingTime } from "../utils/format";

export function AuctionDetailPage() {
  const { auctionId } = useParams();
  const { isAuthenticated } = useAuth();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [messages, setMessages] = useState<AuctionMessage[]>([]);
  const [bidHistory, setBidHistory] = useState<AuctionBid[]>([]);
  const [reviews, setReviews] = useState<AuctionReview[]>([]);
  const [relatedAuctions, setRelatedAuctions] = useState<Auction[]>([]);
  const [sellerAuctions, setSellerAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [postAuctionMessage, setPostAuctionMessage] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [watchlistMessage, setWatchlistMessage] = useState("");
  const [isBidSubmitting, setIsBidSubmitting] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportMessage, setReportMessage] = useState("");

  useEffect(() => {
    if (!auctionId) {
      return;
    }
    getAuction(auctionId)
      .then((data) => {
        setAuction(data);
        listAuctionBids(data.id).then(setBidHistory).catch(() => setBidHistory([]));
        listAuctionReviews(data.id, { limit: 20, sort: "newest" }).then((page) => setReviews(page.items)).catch(() => setReviews([]));
        listRelatedAuctions(data.id).then(setRelatedAuctions).catch(() => setRelatedAuctions([]));
        listSellerOtherAuctions(data.id).then(setSellerAuctions).catch(() => setSellerAuctions([]));
        if (data.can_chat) {
          listAuctionMessages(data.id).then(setMessages).catch(() => setMessages([]));
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [auctionId]);

  useEffect(() => {
    if (!auctionId || typeof EventSource === "undefined") {
      return;
    }
    const source = new EventSource(auctionStreamUrl(auctionId));
    source.addEventListener("auction_update", (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as AuctionRealtimeSnapshot;
      setAuction((current) => current && current.id === snapshot.auction_id
        ? {
            ...current,
            status: snapshot.status,
            current_price: snapshot.current_price,
            highest_bid_id: snapshot.highest_bid_id,
            winner_id: snapshot.winner_id,
            ends_at: snapshot.ends_at,
          }
        : current);
      setBidHistory(snapshot.bids);
    });
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
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

  const placeBidAmount = async (amount: string) => {
    if (!auction || !amount.trim()) {
      return;
    }
    setIsBidSubmitting(true);
    setBidMessage("");
    try {
      const createdBid = await placeAuctionBid(auction.id, amount);
      const [refreshedAuction, refreshedBids] = await Promise.all([
        getAuction(auction.id),
        listAuctionBids(auction.id),
      ]);
      setAuction(refreshedAuction);
      setBidHistory(refreshedBids);
      setBidAmount("");
      setBidMessage(createdBid.reaches_buy_now ? "A licit elérte a villámárat, az aukció lezárult." : "A licit sikeresen rögzítve.");
    } catch (error) {
      setBidMessage(error instanceof Error ? error.message : "A licit rögzítése nem sikerült.");
    } finally {
      setIsBidSubmitting(false);
    }
  };

  const submitBid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await placeBidAmount(bidAmount);
  };

  const addToWatchlist = async () => {
    if (!auction) return;
    try {
      await addWatchlistItem(auction.id);
      setWatchlistMessage("Aukció figyelőlistára téve.");
    } catch (error) {
      setWatchlistMessage(error instanceof Error ? error.message : "Nem sikerült figyelőlistára tenni.");
    }
  };

  const sendReview = async (rating: number) => {
    if (!auction) {
      return;
    }
    const created = await createAuctionReview(auction.id, rating, "Értékelés a sikeresen lezárt aukció után.");
    setReviews((items) => [created, ...items]);
    setAuction({ ...auction, can_review: false });
  };

  if (isLoading) {
    return <section className="container page-shell"><div className="skeleton-card profile-skeleton" aria-label="Aukció betöltése" /></section>;
  }

  if (error || !auction) {
    return <section className="container page-shell"><div className="side-panel form-message" role="alert">{error || "Az aukció nem található."}</div></section>;
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
          <div><dt>Aktuális licit</dt><dd>{formatMoney(auction.current_price ?? auction.starting_price)}</dd></div>
          <div><dt>Kezdőár</dt><dd>{formatMoney(auction.starting_price)}</dd></div>
          <div><dt>Licitlépcső</dt><dd>{formatMoney(auction.bid_increment)}</dd></div>
          <div><dt>Hátralévő idő</dt><dd>{formatRemainingTime(auction.ends_at, auction.status)}</dd></div>
          <div><dt>Kezdés</dt><dd>{formatLocalDateTime(auction.starts_at)}</dd></div>
          <div><dt>Zárás</dt><dd>{formatLocalDateTime(auction.ends_at)}</dd></div>
          <div><dt>Eladó</dt><dd>{auction.seller?.username ? <Link className="seller-link" to={`/users/${auction.seller.username}`}>{auction.seller.full_name ?? auction.seller.username}</Link> : "Eladó"}</dd></div>
          {auction.buy_now_enabled && auction.buy_now_price ? (
            <div><dt>Villámár</dt><dd>{formatMoney(auction.buy_now_price)}</dd></div>
          ) : null}
        </dl>
        {auction.status === "active" && !auction.is_owner ? (
          <form className="bid-panel" onSubmit={submitBid}>
            <label>
              Licit összege
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
              {isBidSubmitting ? "Licit rögzítése..." : "Licitálok"}
            </button>
            {auction.buy_now_enabled && auction.buy_now_price ? (
              <button className="button button-lightning" type="button" disabled={isBidSubmitting} onClick={() => placeBidAmount(auction.buy_now_price ?? "")}>
                Villámár: {formatMoney(auction.buy_now_price)}
              </button>
            ) : null}
            {bidMessage ? <p className="form-message">{bidMessage}</p> : null}
          </form>
        ) : null}
        {auction.status === "sold" && auction.winner_id ? (
          <div className="side-panel sold-state-panel">
            Az aukció lezárult. A nyertes státusz és a kapcsolatfelvétel a backend véglegesített állapota alapján érhető el.
          </div>
        ) : null}
        <div className="hero-actions">
          <button className="button button-secondary" type="button" onClick={addToWatchlist}>Figyelem</button>
          {isAuthenticated && !auction.is_owner ? <button className="button button-ghost" type="button" onClick={() => setShowReportDialog(true)}>Aukció jelentése</button> : null}
          <Link className="button button-ghost" to="/auctions">Vissza az aukciókhoz</Link>
        </div>
        {watchlistMessage ? <p className="form-message">{watchlistMessage}</p> : null}
        {reportMessage ? <p className="form-message">{reportMessage}</p> : null}

        <section className="post-auction-panel">
          <h2>Licittörténet</h2>
          {bidHistory.length === 0 ? (
            <p>Még nincs licit ezen az aukción.</p>
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


        <section className="post-auction-panel">
          <h2>Értékelések</h2>
          {reviews.length === 0 ? (
            <p>Még nincs értékelés ehhez az aukcióhoz.</p>
          ) : (
            <div className="review-list">
              {reviews.map((review) => (
                <article className="review-row" key={review.id}>
                  <div>
                    <strong>{review.reviewer?.username ?? "Felhasználó"}</strong>
                    <span>{formatLocalDateTime(review.created_at)}</span>
                  </div>
                  <span className="star-rating">{Array.from({ length: 5 }).map((_, index) => <span key={index}>{index < review.rating ? "★" : "☆"}</span>)}</span>
                  {review.comment ? <p>{review.comment}</p> : <p className="empty-state">Szöveges értékelés nélkül.</p>}
                </article>
              ))}
            </div>
          )}
        </section>

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
        {showReportDialog ? (
          <ReportDialog
            title="Aukció jelentése"
            targetLabel={auction.title}
            reasons={auctionReportReasons}
            onClose={() => setShowReportDialog(false)}
            onSubmit={(reason, details) => createAuctionReport(auction.id, reason, details).then(() => {
              setReportMessage("A jelentés rögzítve.");
              setShowReportDialog(false);
            })}
          />
        ) : null}
      </div>
      <section className="account-section related-auctions-section" aria-labelledby="related-auctions-title">
        <div className="section-heading"><h2 id="related-auctions-title">Kapcsolódó aukciók</h2></div>
        {relatedAuctions.length === 0 ? <div className="side-panel empty-state">Jelenleg nincs kapcsolódó aukció.</div> : (
          <div className="compact-auction-list">{relatedAuctions.map((item) => <Link className="compact-auction-row" to={`/auctions/${item.id}`} key={item.id}><strong>{item.title}</strong><span>{item.category}</span><span>{formatMoney(item.current_price)}</span><span>{item.bid_count ?? 0} licit</span></Link>)}</div>
        )}
      </section>
      <section className="account-section related-auctions-section" aria-labelledby="seller-auctions-title">
        <div className="section-heading"><h2 id="seller-auctions-title">Az eladó további aukciói</h2></div>
        {sellerAuctions.length === 0 ? <div className="side-panel empty-state">Az eladónak nincs másik publikus aukciója.</div> : (
          <div className="compact-auction-list">{sellerAuctions.map((item) => <Link className="compact-auction-row" to={`/auctions/${item.id}`} key={item.id}><strong>{item.title}</strong><span>{item.category}</span><span>{formatMoney(item.current_price)}</span><span>{formatRemainingTime(item.ends_at, item.status)}</span></Link>)}</div>
        )}
      </section>
    </section>
  );
}
