import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiAssetUrl } from "../api/client";
import { ApiError } from "../api/client";
import { auctionReportReasons, createAuctionReport } from "../api/reports";
import { useAuth } from "../AuthContext";
import { useNotifications } from "../NotificationContext";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { AuctionCountdown } from "../components/AuctionCountdown";
import { ReportDialog } from "../components/ReportDialog";
import { SafeImage } from "../components/SafeImage";
import { ChatTransactionPanel } from "../components/ChatTransactionPanel";
import { addWatchlistItem, auctionStreamUrl, createAuctionMessage, createAuctionReview, getAuction, getAuctionPresence, listAuctionBids, listAuctionMessages, listRelatedAuctions, listSellerOtherAuctions, markAuctionMessagesRead, placeAuctionBid, listAuctionReviews, sendTyping, type Auction, type AuctionBid, type AuctionMessage, type AuctionRealtimeSnapshot, type AuctionReview, type NotificationItem } from "../api/auctions";
import { formatAuctionStatus, formatLocalDateTime, formatMoney, formatRemainingTime } from "../utils/format";

function moneyToCents(value: string | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

function appendUniqueMessage(items: AuctionMessage[], incoming: AuctionMessage) {
  return items.some((item) => item.id === incoming.id) ? items : [...items, incoming];
}

export function AuctionDetailPage() {
  const { auctionId } = useParams();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { subscribe: subscribeNotifications } = useNotifications();
  const { subscribe: subscribeAuctionUpdates } = useAuctionRealtime();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [messages, setMessages] = useState<AuctionMessage[]>([]);
  const [bidHistory, setBidHistory] = useState<AuctionBid[]>([]);
  const [reviews, setReviews] = useState<AuctionReview[]>([]);
  const [relatedAuctions, setRelatedAuctions] = useState<Auction[]>([]);
  const [sellerAuctions, setSellerAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isNotFound, setIsNotFound] = useState(false);
  const [postAuctionMessage, setPostAuctionMessage] = useState("");
  const [messageFeedback, setMessageFeedback] = useState("");
  const [isMessageSending, setIsMessageSending] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(location.hash === "#auction-conversation");
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [watchlistMessage, setWatchlistMessage] = useState("");
  const [isBidSubmitting, setIsBidSubmitting] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [typingUser, setTypingUser] = useState("");
  const [presence, setPresence] = useState<{ online: boolean; last_active_at: string | null } | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const presenceTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const messageSendingRef = useRef(false);
  const chatLauncherRef = useRef<HTMLButtonElement>(null);
  const chatMinimizeRef = useRef<HTMLButtonElement>(null);
  const chatComposerRef = useRef<HTMLTextAreaElement>(null);
  const focusChatOnOpenRef = useRef(location.hash === "#auction-conversation");
  const restoreChatLauncherFocusRef = useRef(false);

  useEffect(() => {
    if (!auctionId || !/^\d+$/.test(auctionId)) {
      setIsNotFound(true);
      setIsLoading(false);
      return;
    }
    setIsNotFound(false);
    setError("");
    setIsLoading(true);
    getAuction(auctionId)
      .then((data) => {
        setAuction(data);
        setSelectedImageId((data.images.find((image) => image.is_cover) ?? data.images[0])?.id ?? null);
        listAuctionBids(data.id).then(setBidHistory).catch(() => setBidHistory([]));
        listAuctionReviews(data.id, { limit: 20, sort: "newest" }).then((page) => setReviews(page.items)).catch(() => setReviews([]));
        listRelatedAuctions(data.id).then(setRelatedAuctions).catch(() => setRelatedAuctions([]));
        listSellerOtherAuctions(data.id).then(setSellerAuctions).catch(() => setSellerAuctions([]));
        if (data.can_chat) {
          listAuctionMessages(data.id).then((items) => { setMessages(items); void markAuctionMessagesRead(data.id); }).catch(() => setMessages([]));
          getAuctionPresence(data.id).then(setPresence).catch(() => setPresence(null));
        }
      })
      .catch((err: Error) => {
        setIsNotFound(err instanceof ApiError && err.status === 404);
        setError(err.message);
      })
      .finally(() => setIsLoading(false));
  }, [auctionId]);

  useEffect(() => {
    if (!auctionId || !/^\d+$/.test(auctionId) || typeof EventSource === "undefined") {
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
    return () => source.close();
  }, [auctionId]);

  useEffect(() => subscribeNotifications((event) => {
    const eventAuctionId = Number(event.payload.auction_id);
    if (!auction || eventAuctionId !== auction.id) return;
    if (event.type === "auction_message") {
      const incoming = event.payload as unknown as AuctionMessage;
      setMessages((items) => appendUniqueMessage(items, incoming));
      if (incoming.sender_id !== user?.id) {
        void markAuctionMessagesRead(auction.id);
      }
    } else if (event.type === "typing" && Number(event.payload.user_id) !== user?.id) {
      setTypingUser(String(event.payload.username ?? "A másik fél"));
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => setTypingUser(""), 3000);
    } else if (event.type === "messages_read") {
      const readAt = String(event.payload.read_at);
      setMessages((items) => items.map((item) => item.sender_id === user?.id && !item.read_at ? { ...item, read_at: readAt } : item));
    } else if (event.type === "presence") {
      setPresence({ online: Boolean(event.payload.online), last_active_at: event.payload.last_active_at ? String(event.payload.last_active_at) : null });
      if (presenceTimerRef.current) window.clearTimeout(presenceTimerRef.current);
      presenceTimerRef.current = window.setTimeout(() => setPresence((value) => value ? { ...value, online: false } : value), 50000);
    }
  }), [auction, subscribeNotifications, user?.id]);

  useEffect(() => subscribeAuctionUpdates((snapshot) => {
    const updateAuction = (item: Auction) => item.id === snapshot.auction_id
      ? { ...item, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count }
      : item;
    setRelatedAuctions((items) => items.map(updateAuction));
    setSellerAuctions((items) => items.map(updateAuction));
  }), [subscribeAuctionUpdates]);

  useEffect(() => {
    if (!isChatOpen || !messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [isChatOpen, messages, typingUser]);

  useEffect(() => {
    if (location.hash === "#auction-conversation") {
      focusChatOnOpenRef.current = true;
      setIsChatOpen(true);
    }
  }, [location.hash]);

  useLayoutEffect(() => {
    if (isChatOpen && focusChatOnOpenRef.current) {
      focusChatOnOpenRef.current = false;
      (chatComposerRef.current ?? chatMinimizeRef.current)?.focus();
    } else if (!isChatOpen && restoreChatLauncherFocusRef.current) {
      restoreChatLauncherFocusRef.current = false;
      chatLauncherRef.current?.focus();
    }
  }, [isChatOpen, auction]);

  useEffect(() => {
    const openIncomingChat = (event: Event) => {
      const notification = (event as CustomEvent<NotificationItem>).detail;
      if (notification.category === "chat" && notification.auction_id === auction?.id) setIsChatOpen(true);
    };
    window.addEventListener("nightfall:notification-received", openIncomingChat);
    return () => window.removeEventListener("nightfall:notification-received", openIncomingChat);
  }, [auction?.id]);

  useEffect(() => {
    const reviewSubmitted = (event: Event) => {
      const submittedAuctionId = Number((event as CustomEvent<{ auctionId: number }>).detail.auctionId);
      if (!auction || submittedAuctionId !== auction.id) return;
      listAuctionReviews(auction.id, { limit: 20, sort: "newest" }).then((page) => setReviews(page.items)).catch(() => undefined);
      setAuction((current) => current ? { ...current, can_review: false } : current);
    };
    window.addEventListener("nightfall:review-submitted", reviewSubmitted);
    return () => window.removeEventListener("nightfall:review-submitted", reviewSubmitted);
  }, [auction]);

  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (presenceTimerRef.current) window.clearTimeout(presenceTimerRef.current);
  }, []);

  const changeMessage = (value: string) => {
    setPostAuctionMessage(value);
    if (!auction || !value.trim() || Date.now() - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = Date.now();
    void sendTyping(auction.id).catch(() => undefined);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auction || !postAuctionMessage.trim() || auction.chat_read_only || messageSendingRef.current) {
      return;
    }
    messageSendingRef.current = true;
    setIsMessageSending(true);
    setMessageFeedback("");
    try {
      const created = await createAuctionMessage(auction.id, postAuctionMessage);
      setMessages((items) => appendUniqueMessage(items, created));
      setPostAuctionMessage("");
      setMessageFeedback("Az üzenet elküldve.");
    } catch (reason) {
      setMessageFeedback(reason instanceof Error ? reason.message : "Az üzenet küldése nem sikerült.");
    } finally {
      messageSendingRef.current = false;
      setIsMessageSending(false);
    }
  };

  const handleMessageKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!postAuctionMessage.trim() || isMessageSending || auction?.chat_read_only) return;
    event.currentTarget.form?.requestSubmit();
  };

  const openChat = () => {
    focusChatOnOpenRef.current = true;
    restoreChatLauncherFocusRef.current = true;
    setIsChatOpen(true);
  };

  const closeChat = () => setIsChatOpen(false);

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
    if (!auction) return;
    const currentCents = moneyToCents(auction.current_price ?? auction.starting_price);
    const incrementCents = moneyToCents(auction.bid_increment);
    if (currentCents === null || incrementCents === null || incrementCents <= 0) {
      setBidMessage("A licitlépcső adatai nem érvényesek.");
      return;
    }
    const minimumCents = currentCents + incrementCents;
    const amount = bidAmount.trim() || centsToAmount(minimumCents);
    const amountCents = moneyToCents(amount);
    const buyNowCents = moneyToCents(auction.buy_now_enabled ? auction.buy_now_price : null);
    if (amountCents === null || amountCents < minimumCents) {
      setBidMessage(`A licit összege legalább ${formatMoney(centsToAmount(minimumCents))} legyen.`);
      return;
    }
    if (buyNowCents !== null && amountCents > buyNowCents) {
      setBidMessage(`A villámár legfeljebb ${formatMoney(centsToAmount(buyNowCents))} lehet.`);
      return;
    }
    if (amountCents !== buyNowCents && (amountCents - minimumCents) % incrementCents !== 0) {
      setBidMessage(`A licit ${formatMoney(centsToAmount(minimumCents))} összegtől ${formatMoney(auction.bid_increment)} licitlépcsőkkel emelhető.`);
      return;
    }
    await placeBidAmount(amount);
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

  if (isNotFound || (error && !auction)) {
    return (
      <section className="container page-shell">
        <div className="side-panel empty-state" role="alert">
          <p className="eyebrow">404</p>
          <h1>Az aukció nem található</h1>
          <p>{isNotFound ? "A megadott aukció nem létezik, vagy már nem publikus." : error}</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>
            <Link className="button button-secondary" to="/">Vissza a kezdőlapra</Link>
          </div>
        </div>
      </section>
    );
  }

  if (!auction) {
    return null;
  }

  const galleryImages = [...auction.images].sort((left, right) => left.position - right.position);
  const selectedImageIndex = Math.max(0, galleryImages.findIndex((image) => image.id === selectedImageId));
  const selectedImage = galleryImages[selectedImageIndex];
  const minimumBidAmount = Number(auction.current_price ?? auction.starting_price) + Number(auction.bid_increment);
  const selectRelativeImage = (direction: -1 | 1) => {
    if (galleryImages.length < 2) return;
    const nextIndex = (selectedImageIndex + direction + galleryImages.length) % galleryImages.length;
    setSelectedImageId(galleryImages[nextIndex].id);
  };

  return (
    <section className="container page-shell detail-layout">
      <div className="auction-gallery">
        <div className="detail-media auction-image">
          <SafeImage
            src={apiAssetUrl(selectedImage?.detail_url ?? selectedImage?.url)}
            alt={selectedImage ? `${auction.title} – ${selectedImageIndex + 1}. kép` : auction.title}
            width={1200}
            height={1200}
          />
          {galleryImages.length > 1 ? (
            <>
              <button className="gallery-arrow gallery-arrow-previous" type="button" aria-label="Előző kép" onClick={() => selectRelativeImage(-1)}><span aria-hidden="true">‹</span></button>
              <button className="gallery-arrow gallery-arrow-next" type="button" aria-label="Következő kép" onClick={() => selectRelativeImage(1)}><span aria-hidden="true">›</span></button>
              <span className="gallery-counter" aria-live="polite">{selectedImageIndex + 1} / {galleryImages.length}</span>
            </>
          ) : null}
        </div>
        {galleryImages.length > 1 ? (
          <div className="gallery-thumbnails" aria-label="Az aukció további képei">
            {galleryImages.map((image, index) => (
              <button
                className={image.id === selectedImage?.id ? "gallery-thumbnail is-active" : "gallery-thumbnail"}
                type="button"
                aria-label={`${index + 1}. kép megnyitása`}
                aria-pressed={image.id === selectedImage?.id}
                onClick={() => setSelectedImageId(image.id)}
                key={image.id}
              >
                <SafeImage src={apiAssetUrl(image.thumbnail_url ?? image.list_url ?? image.url)} alt="" width={160} height={120} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="side-panel detail-panel">
        <p className="eyebrow">{auction.category} · {formatAuctionStatus(auction.status)}</p>
        <h1>{auction.title}</h1>
        <p className="hero-lead">
          {auction.description}
        </p>
        <dl className="detail-list">
          <div><dt>Aktuális licit</dt><dd>{formatMoney(auction.current_price ?? auction.starting_price)}</dd></div>
          <div><dt>Kezdőár</dt><dd>{formatMoney(auction.starting_price)}</dd></div>
          <div><dt>Licitlépcső</dt><dd>{formatMoney(auction.bid_increment)}</dd></div>
          <div className={auction.five_minute_rule_enabled ? "detail-countdown-row" : undefined}><dt>Hátralévő idő</dt><dd><AuctionCountdown endsAt={auction.ends_at} status={auction.status} fiveMinuteRuleEnabled={auction.five_minute_rule_enabled} /></dd></div>
          <div><dt>Kezdés</dt><dd>{formatLocalDateTime(auction.starts_at)}</dd></div>
          <div><dt>Zárás</dt><dd>{formatLocalDateTime(auction.ends_at)}</dd></div>
          <div><dt>Eladó</dt><dd>{auction.seller?.username ? <Link className="seller-link" to={`/users/${auction.seller.username}`}>{auction.seller.full_name ?? auction.seller.username}</Link> : "Eladó"}</dd></div>
          {auction.buy_now_enabled && auction.buy_now_price ? (
            <div><dt>Villámár</dt><dd>{formatMoney(auction.buy_now_price)}</dd></div>
          ) : null}
        </dl>
        {auction.status === "active" && !auction.is_owner && isAuthenticated ? (
          <form className="bid-panel" id="bid-section" onSubmit={submitBid} noValidate>
            <label>
              Licit összege
              <input
                min={minimumBidAmount}
                max={auction.buy_now_enabled && auction.buy_now_price ? auction.buy_now_price : undefined}
                step={auction.bid_increment}
                type="number"
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
                placeholder={String(minimumBidAmount)}
              />
            </label>
            <button className="button button-primary" type="submit" disabled={isBidSubmitting}>
              {isBidSubmitting ? "Licit rögzítése..." : "Licitálok"}
            </button>
            {auction.buy_now_enabled && auction.buy_now_price ? (
              <button className="button button-lightning" id="buy-now-section" type="button" disabled={isBidSubmitting} onClick={() => placeBidAmount(auction.buy_now_price ?? "")}>
                Villámár: {formatMoney(auction.buy_now_price)}
              </button>
            ) : null}
            {bidMessage ? <p className="form-message" role="status" aria-live="polite">{bidMessage}</p> : null}
          </form>
        ) : null}
        {auction.status === "active" && !auction.is_owner && !isAuthenticated ? (
          <div className="side-panel bid-panel" id="bid-section">
            <h2>Jelentkezz be a licitáláshoz</h2>
            <p>A licitálás, a villámár és a figyelőlista bejelentkezés után érhető el.</p>
            <Link className="button button-primary" id="buy-now-section" to={`/login?next=${encodeURIComponent(`/auctions/${auction.id}`)}`}>
              Bejelentkezés a licitáláshoz
            </Link>
          </div>
        ) : null}
        {auction.status === "sold" && auction.winner_id ? (
          <div className="side-panel sold-state-panel">
            {auction.can_chat
              ? <>Az aukció lezárult. <a href="#auction-conversation">Nyisd meg a privát beszélgetést</a> a másik féllel az egyeztetéshez.</>
              : "Az aukció lezárult. A privát kapcsolatfelvétel kizárólag az eladó és a nyertes számára érhető el."}
          </div>
        ) : null}
        <div className="hero-actions">
          {isAuthenticated ? (
            <button className="button button-secondary" type="button" onClick={addToWatchlist}>Figyelem</button>
          ) : (
            <Link className="button button-secondary" to={`/login?next=${encodeURIComponent(`/auctions/${auction.id}`)}`}>Belépés a figyeléshez</Link>
          )}
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

        {auction.can_chat && !isChatOpen ? createPortal(<button ref={chatLauncherRef} className="button button-primary chat-launcher" type="button" onClick={openChat} aria-controls="auction-conversation" aria-expanded="false">Üzenetek megnyitása</button>, document.body) : null}
        {auction.can_chat && isChatOpen ? createPortal((
          <section className="post-auction-panel auction-conversation chat-dock" id="auction-conversation" role="dialog" aria-label={`${auction.title} privát beszélgetése`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeChat(); } }}>
            <header className="chat-dock-header">
              <div><strong>Aukciós chat</strong><small>{auction.title}</small></div>
              <p className={`presence-indicator${presence?.online ? " is-online" : ""}`}>{presence?.online ? "Elérhető" : presence?.last_active_at ? `Utoljára aktív: ${formatLocalDateTime(presence.last_active_at)}` : "Nem elérhető"}</p>
              <button ref={chatMinimizeRef} className="chat-minimize-button" type="button" aria-label="Chat kis méretre zárása" onClick={closeChat}>−</button>
            </header>
            <div className="chat-boundary-note" role="note">A fizetést és az átadást egymással egyeztetitek.</div>
            <ChatTransactionPanel auctionId={auction.id} />
            <div className="message-list" ref={messageListRef} aria-live="polite" aria-label="Privát beszélgetés üzenetei">
              {messages.length === 0 ? <p className="empty-state">Még nincs üzenet. Írj a másik félnek az egyeztetés megkezdéséhez.</p> : null}
              {messages.map((message) => (
                <article className={message.sender_id === user?.id ? "message-row is-own" : "message-row"} key={message.id}>
                  <div><strong>{message.sender?.full_name ?? (message.sender_id === user?.id ? "Te" : "Másik fél")}</strong><time>{formatLocalDateTime(message.created_at)}</time></div>
                  <p>{message.message}</p>
                  {message.sender_id === user?.id ? <span className="message-receipt" aria-label={message.read_at ? "Elolvasva" : "Elküldve"}>{message.read_at ? "✓✓" : "✓"}</span> : null}
                </article>
              ))}
              {typingUser ? <p className="typing-indicator" aria-live="polite">{typingUser} ír…</p> : null}
            </div>
            {auction.chat_read_only ? <p className="chat-read-only-note" role="status">Ez az archivált beszélgetés csak olvasható.</p> : (
              <form className="chat-composer" onSubmit={sendMessage}>
                <label className="visually-hidden" htmlFor="auction-message">Üzenet a másik félnek</label>
                <textarea ref={chatComposerRef} id="auction-message" aria-describedby="chat-keyboard-help" maxLength={2000} required value={postAuctionMessage} onChange={(event) => changeMessage(event.target.value)} onKeyDown={handleMessageKeyDown} rows={2} placeholder="Írj egy üzenetet…" />
                <button className="button button-primary" type="submit" disabled={isMessageSending || !postAuctionMessage.trim()} aria-label="Üzenet küldése">{isMessageSending ? "Küldés..." : "Küldés"}</button>
                <small id="chat-keyboard-help">Enter: küldés · Shift+Enter: új sor</small>
                {messageFeedback ? <p className="form-message" role="status">{messageFeedback}</p> : null}
              </form>
            )}
          </section>
        ), document.body) : null}

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
