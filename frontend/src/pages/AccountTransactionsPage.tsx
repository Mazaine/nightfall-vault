import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { confirmTransactionCompletion, listTransactions, type AuctionTransaction, type TransactionStatus } from "../api/transactions";
import { formatLocalDateTime } from "../utils/format";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";

const statusLabels: Record<TransactionStatus, string> = {
  transaction_open: "Egyeztetés folyamatban",
  completed: "Értékelésre vár",
  reviewed: "Értékelve",
  archived: "Lezárva",
};

export function AccountTransactionsPage() {
  const [items, setItems] = useState<AuctionTransaction[]>([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setItems((await listTransactions(status)).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "A tranzakciók betöltése nem sikerült."); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const confirm = async (item: AuctionTransaction) => {
    if (!window.confirm("Csak akkor erősítsd meg, ha az adásvétel valóban megtörtént. A Nightfall Vault nem kezel fizetést vagy szállítást.")) return;
    try {
      const updated = await confirmTransactionCompletion(item.id);
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setMessage("A teljesítési megerősítést rögzítettük.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A megerősítés nem sikerült."); }
  };

  return (
    <section className="account-section">
      <div className="section-heading"><div><p className="eyebrow">Aukció után</p><h1>Tranzakcióim</h1><p className="section-note">A fizetést és az átadást a partnereddel, a privát chatben egyezteted.</p></div></div>
      <label className="transaction-filter">Státusz <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Összes</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {loading ? <LoadingState label="Tranzakciók betöltése" cards={2} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title={status ? "Nincs ilyen állapotú tranzakció" : "Még nincs tranzakciód"} action={status ? <button className="button button-secondary" type="button" onClick={() => setStatus("")}>Összes tranzakció</button> : <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}
      <div className="transaction-list" aria-busy={loading}>
        {items.map((item) => (
          <article className="side-panel transaction-card" key={item.id}>
            <div><span className={`transaction-status transaction-status-${item.status}`}>{statusLabels[item.status]}</span><h2><Link to={`/auctions/${item.auction_id}`}>{item.auction.title}</Link></h2><p>{item.role === "seller" ? "Eladó" : "Nyertes"} · partner: <Link to={`/users/${item.partner.username}`}>{item.partner.username}</Link></p></div>
            <dl className="detail-list"><div><dt>Saját megerősítés</dt><dd>{item.own_completed_at ? formatLocalDateTime(item.own_completed_at) : "Még nincs"}</dd></div><div><dt>Partner megerősítése</dt><dd>{item.partner_completed_at ? formatLocalDateTime(item.partner_completed_at) : "Még nincs"}</dd></div>{item.review_deadline ? <div><dt>Értékelési határidő</dt><dd>{formatLocalDateTime(item.review_deadline)}</dd></div> : null}</dl>
            <div className="transaction-actions"><Link className="button button-secondary" to={`/auctions/${item.auction_id}#chat-section`}>Chat megnyitása</Link>{item.can_confirm ? <button className="button button-primary" type="button" onClick={() => void confirm(item)}>Teljesítés megerősítése</button> : null}{item.can_review ? <Link className="button button-secondary" to={`/auctions/${item.auction_id}#review-section`}>Értékelés</Link> : null}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
