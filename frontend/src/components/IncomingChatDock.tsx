import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useNotifications } from "../NotificationContext";
import { createAuctionMessage, getAuction, listAuctionMessages, markAuctionMessagesRead, sendTyping, type Auction, type AuctionMessage } from "../api/auctions";
import { formatLocalDateTime } from "../utils/format";
import { ChatTransactionPanel } from "./ChatTransactionPanel";

function appendUnique(items: AuctionMessage[], incoming: AuctionMessage) {
  return items.some((item) => item.id === incoming.id) ? items : [...items, incoming];
}

function mergeUnique(items: AuctionMessage[], incoming: AuctionMessage[]) {
  return incoming.reduce(appendUnique, items).sort((left, right) => left.id - right.id);
}

export function IncomingChatDock() {
  const { isAuthenticated, user } = useAuth();
  const { subscribe } = useNotifications();
  const location = useLocation();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [messages, setMessages] = useState<AuctionMessage[]>([]);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const activeAuctionIdRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const focusOnOpenRef = useRef(false);
  const restoreLauncherFocusRef = useRef(false);

  const loadConversation = useCallback(async (auctionId: number, incoming?: AuctionMessage) => {
    activeAuctionIdRef.current = auctionId;
    setFeedback("");
    if (incoming) setMessages((items) => activeAuctionIdRef.current === auctionId ? appendUnique(items, incoming) : [incoming]);
    try {
      const [auctionData, messageItems] = await Promise.all([getAuction(auctionId), listAuctionMessages(auctionId)]);
      if (activeAuctionIdRef.current !== auctionId) return;
      setAuction(auctionData);
      setMessages((items) => mergeUnique(messageItems, incoming ? appendUnique(items, incoming) : items));
      await markAuctionMessagesRead(auctionId);
    } catch (reason) {
      if (activeAuctionIdRef.current === auctionId) setFeedback(reason instanceof Error ? reason.message : "A beszélgetés betöltése nem sikerült.");
    }
  }, []);

  useEffect(() => subscribe((event) => {
    if (event.type === "notification" && event.payload.category === "chat" && event.payload.in_app_enabled !== false) {
      const auctionId = Number(event.payload.auction_id);
      if (!auctionId || location.pathname === `/auctions/${auctionId}`) return;
      setIsOpen(true);
      if (activeAuctionIdRef.current !== auctionId) {
        setMessages([]);
        void loadConversation(auctionId);
      } else {
        void markAuctionMessagesRead(auctionId);
      }
    } else if (event.type === "auction_message") {
      const incoming = event.payload as unknown as AuctionMessage & { auction_id: number };
      const auctionId = Number(incoming.auction_id);
      if (!auctionId || incoming.sender_id === user?.id || activeAuctionIdRef.current !== auctionId) return;
      if (location.pathname !== `/auctions/${auctionId}`) {
        setMessages((items) => appendUnique(items, incoming));
        void markAuctionMessagesRead(auctionId);
      }
    } else if (event.type === "typing" && Number(event.payload.auction_id) === activeAuctionIdRef.current && Number(event.payload.user_id) !== user?.id) {
      setTypingUser(String(event.payload.username ?? "A másik fél"));
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => setTypingUser(""), 3000);
    }
  }), [loadConversation, location.pathname, subscribe, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      activeAuctionIdRef.current = null;
      setAuction(null);
      setMessages([]);
      setIsOpen(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const activeAuctionId = activeAuctionIdRef.current;
    if (!activeAuctionId || location.pathname !== `/auctions/${activeAuctionId}`) return;
    activeAuctionIdRef.current = null;
    setAuction(null);
    setMessages([]);
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [isOpen, messages, typingUser]);

  useEffect(() => {
    if (isOpen && focusOnOpenRef.current) {
      focusOnOpenRef.current = false;
      window.requestAnimationFrame(() => (composerRef.current ?? minimizeRef.current)?.focus());
    } else if (!isOpen && restoreLauncherFocusRef.current) {
      restoreLauncherFocusRef.current = false;
      window.requestAnimationFrame(() => launcherRef.current?.focus());
    }
  }, [isOpen, auction]);

  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
  }, []);

  const changeMessage = (value: string) => {
    setMessage(value);
    if (!auction || !value.trim() || Date.now() - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = Date.now();
    void sendTyping(auction.id).catch(() => undefined);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auction || auction.chat_read_only || !message.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    setFeedback("");
    try {
      const created = await createAuctionMessage(auction.id, message);
      setMessages((items) => appendUnique(items, created));
      setMessage("");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Az üzenet küldése nem sikerült.");
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!message.trim() || isSending || auction?.chat_read_only) return;
    event.currentTarget.form?.requestSubmit();
  };

  const openFromLauncher = () => {
    focusOnOpenRef.current = true;
    restoreLauncherFocusRef.current = true;
    setIsOpen(true);
  };

  const closeChat = () => setIsOpen(false);

  if (!isAuthenticated || !activeAuctionIdRef.current) return null;

  return createPortal(isOpen ? (
    <section className="post-auction-panel auction-conversation chat-dock global-chat-dock" role="dialog" aria-label={`${auction?.title ?? "Aukció"} privát beszélgetése`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeChat(); } }}>
      <header className="chat-dock-header">
        <div>
          <strong>Új aukciós üzenet</strong>
          {auction ? <Link to={`/auctions/${auction.id}#auction-conversation`} onClick={() => setIsOpen(false)}>{auction.title}</Link> : <small>Beszélgetés betöltése…</small>}
        </div>
        <button ref={minimizeRef} className="chat-minimize-button" type="button" aria-label="Chat kis méretre zárása" onClick={closeChat}>−</button>
      </header>
      <div className="chat-boundary-note" role="note">A fizetést és az átadást egymással egyeztetitek.</div>
      {auction ? <ChatTransactionPanel auctionId={auction.id} /> : null}
      <div className="message-list" ref={listRef} aria-live="polite" aria-label="Bejövő aukciós beszélgetés üzenetei">
        {messages.map((item) => <article className={item.sender_id === user?.id ? "message-row is-own" : "message-row"} key={item.id}>
          <div><strong>{item.sender?.full_name ?? (item.sender_id === user?.id ? "Te" : "Másik fél")}</strong><time>{formatLocalDateTime(item.created_at)}</time></div>
          <p>{item.message}</p>
        </article>)}
        {typingUser ? <p className="typing-indicator" aria-live="polite">{typingUser} ír…</p> : null}
      </div>
      {auction?.chat_read_only ? <p className="chat-read-only-note" role="status">Ez az archivált beszélgetés csak olvasható.</p> : (
        <form className="chat-composer" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="global-auction-message">Üzenet a felugró chatben</label>
          <textarea ref={composerRef} id="global-auction-message" value={message} onChange={(event) => changeMessage(event.target.value)} onKeyDown={handleKeyDown} rows={2} maxLength={2000} placeholder="Írj egy üzenetet…" disabled={!auction} />
          <button className="button button-primary" type="submit" disabled={!auction || isSending || !message.trim()}>{isSending ? "Küldés…" : "Küldés"}</button>
          <small>Enter: küldés · Shift+Enter: új sor</small>
          {feedback ? <p className="form-message" role="alert">{feedback}</p> : null}
        </form>
      )}
    </section>
  ) : (
    <button ref={launcherRef} className="button button-primary chat-launcher global-chat-launcher" type="button" aria-label="Legutóbbi aukciós chat megnyitása" onClick={openFromLauncher}>Üzenet</button>
  ), document.body);
}
