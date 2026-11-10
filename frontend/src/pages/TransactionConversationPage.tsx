import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../AuthContext";
import { useNotifications } from "../NotificationContext";
import { createTransactionConversationMessage, getTransactionConversation, type TransactionConversation } from "../api/transactions";
import { ErrorState, LoadingState } from "../components/AsyncStates";
import { formatLocalDateTime, formatMoney } from "../utils/format";

export function TransactionConversationPage() {
  const { conversationId = "" } = useParams();
  const id = Number(conversationId);
  const { user } = useAuth();
  const { subscribe } = useNotifications();
  const [conversation, setConversation] = useState<TransactionConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) { setError("Az ügyletbeszélgetés azonosítója érvénytelen."); return; }
    try { setError(""); setConversation(await getTransactionConversation(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "A közös egyeztetés nem tölthető be."); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribe((event) => {
    const eventConversationId = Number(event.payload.conversation_id);
    const targetUrl = String(event.payload.target_url ?? "");
    if ((event.type === "transaction_conversation_message" && eventConversationId === id) || targetUrl.endsWith(`/transactions/conversations/${id}`)) void load();
  }), [id, load, subscribe]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [conversation?.messages.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true); setError("");
    try { setConversation(await createTransactionConversationMessage(id, message)); setDraft(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Az üzenet küldése nem sikerült."); }
    finally { setSending(false); }
  };

  if (!conversation && !error) return <LoadingState label="Közös egyeztetés betöltése" cards={2} />;
  if (!conversation && error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!conversation) return null;

  return <section className="transaction-conversation-page">
    <header className="transaction-conversation-heading">
      <div><p className="eyebrow">{conversation.role === "seller" ? "Eladások" : "Vásárlások"}</p><h1>Közös egyeztetés</h1><p><Link to={`/users/${conversation.partner.username}`}>{conversation.partner.full_name || conversation.partner.username}</Link> · @{conversation.partner.username}</p></div>
      <Link className="button button-secondary" to="/account/transactions">Vissza az ügyletekhez</Link>
    </header>

    <section className="side-panel transaction-conversation-summary" aria-label="Kapcsolódó ügyletek elszámolása">
      <div className="transaction-conversation-total"><strong>{conversation.transactions.length} ügylet · {conversation.item_count} db</strong><strong>{formatMoney(conversation.total)}</strong></div>
      {conversation.transactions.map((transaction) => <article key={transaction.id}>
        <header><Link to={`/auctions/${transaction.auction_id}`}>{transaction.auction.title}</Link><span>Ügylet #{transaction.id} · {formatLocalDateTime(transaction.created_at)}</span></header>
        {transaction.items?.length ? transaction.items.map((item) => <div className="transaction-conversation-line" key={item.id}><span>{item.title}</span><span>{item.quantity} db × {formatMoney(item.unit_price)}</span><strong>{formatMoney(item.subtotal)}</strong></div>) : <p className="section-note">Régi ügylet: nincs tételszintű ár- és mennyiségadat.</p>}
        <div className="transaction-conversation-subtotal"><span>Ügylet összege</span><strong>{formatMoney(transaction.total ?? 0)}</strong></div>
      </article>)}
    </section>

    <section className="side-panel transaction-conversation-chat" aria-label="Közös ügyletbeszélgetés">
      <div className="message-list" ref={listRef} aria-live="polite">
        {conversation.messages.length === 0 ? <p className="empty-state">Még nincs üzenet. Kezdd el a közös egyeztetést.</p> : conversation.messages.map((message) => <article className={message.sender_id === user?.id ? "message-row is-own" : "message-row"} key={`${message.source}:${message.id}`}>
          <div><strong>{message.sender_id === user?.id ? "Te" : message.sender.full_name || message.sender.username}</strong><time>{formatLocalDateTime(message.created_at)}</time></div>
          {message.source === "legacy" && message.auction_id ? <Link className="transaction-message-source" to={`/auctions/${message.auction_id}#auction-conversation`}>Korábbi hirdetés: {message.auction_title ?? `#${message.auction_id}`}</Link> : null}
          <p>{message.message}</p>
          {message.source === "common" && message.sender_id === user?.id ? <span className="message-receipt">{message.read_at ? "✓✓" : "✓"}</span> : null}
        </article>)}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="transaction-conversation-message">Üzenet a partnernek</label>
        <textarea id="transaction-conversation-message" rows={3} maxLength={2000} required value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Egyeztesd egy helyen az összes közös ügyletet…" />
        <button className="button button-primary" type="submit" disabled={sending || !draft.trim()}>{sending ? "Küldés…" : "Küldés"}</button>
      </form>
      {error ? <p className="form-message" role="alert">{error}</p> : null}
    </section>
  </section>;
}
