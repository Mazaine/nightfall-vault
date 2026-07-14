import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiAssetUrl } from "../api/client";
import { confirmTransaction, listMyTransactions, openTransactionDispute, type AuctionTransaction, type TransactionStatus } from "../api/transactions";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { formatLocalDateTime, formatMoney } from "../utils/format";

const statusLabels: Record<TransactionStatus, string> = {
  awaiting_arrangement: "Egyeztetésre vár",
  in_progress: "Folyamatban",
  completed: "Sikeresen lezárva",
  disputed: "Vita alatt",
  cancelled: "Megszakítva",
};

export function AccountTransactionsPage() {
  const [items, setItems] = useState<AuctionTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [activeAction, setActiveAction] = useState<number | null>(null);
  const [disputeId, setDisputeId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try { setItems(await listMyTransactions()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "A tranzakciók betöltése nem sikerült."); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function confirm(item: AuctionTransaction) {
    setActiveAction(item.id); setActionError("");
    try { await confirmTransaction(item.id); await load(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "A visszaigazolás nem sikerült."); }
    finally { setActiveAction(null); }
  }

  async function submitDispute(event: FormEvent, item: AuctionTransaction) {
    event.preventDefault(); setActiveAction(item.id); setActionError("");
    try {
      await openTransactionDispute(item.id, disputeReason);
      setDisputeId(null); setDisputeReason(""); await load();
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "A vita megnyitása nem sikerült."); }
    finally { setActiveAction(null); }
  }

  return <>
    <div className="section-heading page-heading compact-page-heading"><div><p className="eyebrow">Marketplace</p><h1>Tranzakcióim</h1><p className="section-note">Az eladott és megnyert aukciók átadásának közös visszaigazolása.</p></div></div>
    {isLoading ? <LoadingState label="Tranzakciók betöltése" /> : null}
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
    {actionError ? <div className="side-panel error-state" role="alert"><p>{actionError}</p></div> : null}
    {!isLoading && !error && items.length === 0 ? <EmptyState title="Még nincs lezárt aukciós tranzakciód" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}
    <div className="transaction-list">
      {items.map((item) => <article className="side-panel transaction-card" key={item.id}>
        {item.auction_image_key ? <img src={apiAssetUrl(item.auction_image_key)} alt="" /> : <div className="transaction-image-placeholder" aria-hidden="true" />}
        <div className="transaction-copy">
          <div className="transaction-heading"><div><span className="status-badge">{statusLabels[item.status]}</span><h2><Link to={`/auctions/${item.auction_id}`}>{item.auction_title}</Link></h2></div><strong>{formatMoney(item.amount)}</strong></div>
          <p>{item.role === "seller" ? "Eladóként" : "Vevőként"} veszel részt. Másik fél: <Link to={`/users/${item.counterparty.username}`}>{item.counterparty.full_name}</Link>.</p>
          <div className="transaction-confirmations" aria-label="Teljesítési visszaigazolások"><span className={item.seller_confirmed ? "is-complete" : ""}>Eladó: {item.seller_confirmed ? "visszaigazolta" : "függőben"}</span><span className={item.buyer_confirmed ? "is-complete" : ""}>Vevő: {item.buyer_confirmed ? "visszaigazolta" : "függőben"}</span></div>
          <small>Utolsó frissítés: {formatLocalDateTime(item.updated_at)}</small>
          {item.dispute_reason ? <p className="transaction-dispute"><strong>Vita indoka:</strong> {item.dispute_reason}</p> : null}
          <div className="transaction-actions">
            {item.can_confirm ? <button className="button button-primary" type="button" disabled={activeAction === item.id} onClick={() => void confirm(item)}>{item.role === "seller" ? "Átadást visszaigazolom" : "Átvételt visszaigazolom"}</button> : null}
            {item.can_dispute && disputeId !== item.id ? <button className="button button-ghost" type="button" onClick={() => { setDisputeId(item.id); setDisputeReason(""); }}>Probléma jelzése</button> : null}
          </div>
          {disputeId === item.id ? <form className="transaction-dispute-form" onSubmit={(event) => void submitDispute(event, item)}><label htmlFor={`dispute-${item.id}`}>Írd le röviden a problémát</label><textarea id={`dispute-${item.id}`} minLength={10} maxLength={1000} required value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} /><div className="transaction-actions"><button className="button button-danger" type="submit" disabled={activeAction === item.id || disputeReason.trim().length < 10}>Vita megnyitása</button><button className="button button-ghost" type="button" onClick={() => setDisputeId(null)}>Mégse</button></div></form> : null}
        </div>
      </article>)}
    </div>
  </>;
}
