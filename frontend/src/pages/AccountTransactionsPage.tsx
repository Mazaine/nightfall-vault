import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { cancelTransaction, confirmTransactionCompletion, deleteClosedTransaction, listTransactions, saveTransactionNote, type AuctionTransaction, type TransactionStatus } from "../api/transactions";
import { formatLocalDateTime, formatMoney } from "../utils/format";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";

const statusLabels: Record<TransactionStatus, string> = {
  transaction_open: "Egyeztetés folyamatban",
  completed: "Értékelésre vár",
  reviewed: "Értékelve",
  archived: "Lezárva",
  cancelled: "Meghiúsult",
};

export function AccountTransactionsPage() {
  const [items, setItems] = useState<AuctionTransaction[]>([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = (await listTransactions(status, 100)).items;
      setItems(loaded);
      setNoteDrafts(Object.fromEntries(loaded.map((item) => [item.id, item.own_note ?? ""])));
    }
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

  const saveNote = async (item: AuctionTransaction) => {
    setBusyId(item.id);
    setMessage("");
    try {
      const updated = await saveTransactionNote(item.id, noteDrafts[item.id] ?? "");
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setNoteDrafts((current) => ({ ...current, [item.id]: updated.own_note ?? "" }));
      setMessage("A megjegyzést elmentettük.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "A megjegyzés mentése nem sikerült."); }
    finally { setBusyId(null); }
  };

  const remove = async (item: AuctionTransaction) => {
    if (!window.confirm("Biztosan törlöd ezt a lezárt tranzakciót a saját listádról? A másik fél listája, az aukció és a chat nem törlődik.")) return;
    setBusyId(item.id);
    setMessage("");
    try {
      await deleteClosedTransaction(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage("A tranzakciót eltávolítottuk a saját listádról.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "A tranzakció törlése nem sikerült."); }
    finally { setBusyId(null); }
  };

  const cancel = async (item: AuctionTransaction) => {
    if (!window.confirm("Biztosan meghiúsultként zárod le ezt az ügyletet? A lefoglalt készlet ismét elérhető lesz.")) return;
    setBusyId(item.id); setMessage("");
    try { const updated = await cancelTransaction(item.id); setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); setMessage("Az ügyletet meghiúsultként lezártuk."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Az ügylet lezárása nem sikerült."); }
    finally { setBusyId(null); }
  };

  const partnerGroups = useMemo(() => {
    const groups = new Map<string, { partner: AuctionTransaction["partner"]; role: AuctionTransaction["role"]; open: AuctionTransaction[]; closed: AuctionTransaction[] }>();
    for (const item of items) {
      const key = `${item.role}:${item.partner.username}`;
      const group = groups.get(key) ?? { partner: item.partner, role: item.role, open: [], closed: [] };
      (item.status === "transaction_open" ? group.open : group.closed).push(item);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [items]);

  const renderTransaction = (item: AuctionTransaction) => <article className="side-panel transaction-card" key={item.id}>
    <div><span className={`transaction-status transaction-status-${item.status}`}>{statusLabels[item.status]}</span><h3><Link to={`/auctions/${item.auction_id}`}>{item.auction.title}</Link></h3><p>Ügylet #{item.id} · {formatLocalDateTime(item.created_at)}</p></div>
    <dl className="detail-list"><div><dt>Saját megerősítés</dt><dd>{item.own_completed_at ? formatLocalDateTime(item.own_completed_at) : "Még nincs"}</dd></div><div><dt>Partner megerősítése</dt><dd>{item.partner_completed_at ? formatLocalDateTime(item.partner_completed_at) : "Még nincs"}</dd></div>{item.review_deadline ? <div><dt>Értékelési határidő</dt><dd>{formatLocalDateTime(item.review_deadline)}</dd></div> : null}</dl>
    {item.items?.length ? <div className="transaction-items-table" role="table" aria-label={`A(z) ${item.id}. ügylet tételei`}><div className="transaction-items-head" role="row"><span>Tétel</span><span>Db</span><span>Egységár</span><span>Részösszeg</span></div>{item.items.map((line) => <div role="row" key={line.id}><span>{line.title}</span><span>{line.quantity}</span><span>{formatMoney(line.unit_price)}</span><strong>{formatMoney(line.subtotal)}</strong></div>)}<div className="transaction-items-total"><span>Összesen</span><strong>{formatMoney(item.total ?? 0)}</strong></div></div> : <p className="section-note">Régi ügylet: tételszintű ár- és mennyiségadat nem áll rendelkezésre.</p>}
    <label className="transaction-note">Saját megjegyzés<textarea rows={3} maxLength={2000} value={noteDrafts[item.id] ?? ""} onChange={(event) => setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Például: átvétel egyeztetve péntekre" /></label>
    <div className="transaction-actions"><button className="button button-secondary" type="button" disabled={busyId === item.id || (noteDrafts[item.id] ?? "").trim() === (item.own_note ?? "")} onClick={() => void saveNote(item)}>{busyId === item.id ? "Mentés…" : "Megjegyzés mentése"}</button><Link className="button button-secondary" to={`/auctions/${item.auction_id}#auction-conversation`}>Chat megnyitása</Link>{item.can_confirm ? <button className="button button-primary" type="button" disabled={busyId === item.id} onClick={() => void confirm(item)}>Teljesítés megerősítése</button> : null}{item.status === "transaction_open" && item.items?.length ? <button className="button button-danger" type="button" disabled={busyId === item.id} onClick={() => void cancel(item)}>Ügylet meghiúsult</button> : null}{item.can_review ? <Link className="button button-secondary" to={`/auctions/${item.auction_id}#review-section`}>Értékelés</Link> : null}{item.can_delete ? <button className="button button-danger" type="button" disabled={busyId === item.id} onClick={() => void remove(item)}>Tranzakció törlése</button> : null}</div>
  </article>;

  return (
    <section className="account-section">
      <div className="section-heading"><div><p className="eyebrow">Piactéri egyeztetés</p><h1>Saját ügyleteim</h1><p className="section-note">Az egy partnerrel kötött vásárlásokat és eladásokat egy helyen látod. Az eredeti ügyletek, megerősítések és értékelések változatlanul külön maradnak.</p></div></div>
      <label className="transaction-filter">Státusz <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Összes</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {loading ? <LoadingState label="Tranzakciók betöltése" cards={2} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title={status ? "Nincs ilyen állapotú tranzakció" : "Még nincs tranzakciód"} action={status ? <button className="button button-secondary" type="button" onClick={() => setStatus("")}>Összes tranzakció</button> : <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}
      <div className="transaction-partner-list" aria-busy={loading}>
        {partnerGroups.map((group) => {
          const openQuantity = group.open.reduce((sum, transaction) => sum + (transaction.items?.reduce((lineSum, line) => lineSum + line.quantity, 0) ?? 0), 0);
          const openTotal = group.open.reduce((sum, transaction) => sum + Number(transaction.total ?? 0), 0);
          return <section className="transaction-partner-group" key={`${group.role}:${group.partner.username}`}>
            <header><div><p className="eyebrow">{group.role === "seller" ? "Eladások" : "Vásárlások"}</p><h2><Link aria-label={group.partner.username} to={`/users/${group.partner.username}`}>{group.partner.full_name || group.partner.username}</Link></h2><p>@{group.partner.username} · {group.open.length} nyitott · {group.closed.length} lezárt ügylet</p>{group.open.length ? <p className="transaction-partner-summary"><strong>{group.open.length} vásárlás · {openQuantity} lap · {formatMoney(openTotal)}</strong></p> : null}</div>{group.open[0] ? <Link className="button button-primary" to={group.open[0].conversation_id ? `/account/transactions/conversations/${group.open[0].conversation_id}` : `/auctions/${group.open[0].auction_id}#auction-conversation`}>Közös egyeztetés</Link> : null}</header>
            {group.open.length ? <div className="transaction-group-section"><h3>Nyitott ügyletek</h3>{group.open.map(renderTransaction)}</div> : null}
            {group.closed.length ? <details className="transaction-group-section"><summary>Lezárt ügyletek ({group.closed.length})</summary>{group.closed.map(renderTransaction)}</details> : null}
          </section>;
        })}
      </div>
    </section>
  );
}
