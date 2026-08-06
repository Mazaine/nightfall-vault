import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../AuthContext";
import { listMyAuctions, listMyBidAuctionsPage } from "../../api/auctions";
import { listTransactions } from "../../api/transactions";
import { useAuctionRealtime } from "../../AuctionRealtimeContext";

type Task = { label: string; detail: string; to: string; tone?: "warning" | "success" };

const memberActions = [
  ["Aukció indítása", "/account/auctions#auction-create", "Új tétel felvétele"],
  ["Saját aukcióim", "/account/auctions", "Piszkozatok és futó tételek"],
  ["Licitjeim", "/my-bids", "Vezető és túllicitált ajánlatok"],
  ["Aukciók böngészése", "/auctions", "Fedezd fel az aktuális kínálatot"],
] as const;

export function HomeDashboard() {
  const { isAuthenticated, isLoading } = useAuth();
  const { subscribe } = useAuctionRealtime();
  const [tasks, setTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [bids, auctions, transactions] = await Promise.all([
        listMyBidAuctionsPage("active", 8, 0),
        listMyAuctions(),
        listTransactions("transaction_open", 8),
      ]);
      const next: Task[] = [];
      const outbid = bids.items.filter((item) => item.is_outbid);
      const leading = bids.items.filter((item) => item.is_leading);
      const drafts = auctions.filter((item) => item.status === "draft");
      if (outbid.length) next.push({ label: `${outbid.length} aukción rád licitáltak`, detail: "Nézd meg, szeretnél-e új licitet tenni.", to: "/my-bids?state=outbid", tone: "warning" });
      if (leading.length) next.push({ label: `${leading.length} aukción te vezetsz`, detail: "Kövesd a hátralévő időt valós időben.", to: "/my-bids?state=leading", tone: "success" });
      if (drafts.length) next.push({ label: `${drafts.length} piszkozat vár befejezésre`, detail: "Folytasd ugyanazt a mentett aukciót.", to: "/account/auctions" });
      if (transactions.items.length) next.push({ label: `${transactions.items.length} nyitott tranzakciód van`, detail: "Egyeztess, majd erősítsétek meg a lezárást.", to: "/account/transactions" });
      setTasks(next.slice(0, 4));
    } catch {
      setTasks([]);
    }
  }, [isAuthenticated]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => isAuthenticated ? subscribe(() => { void loadTasks(); }) : undefined, [isAuthenticated, loadTasks, subscribe]);

  if (isLoading) return null;
  if (!isAuthenticated) return <section className="container home-quick-actions" aria-labelledby="home-actions-title"><div className="section-heading"><div><span className="eyebrow">KEZDD EL</span><h2 id="home-actions-title">Lépj be a boltozatba</h2></div></div><div className="quick-action-grid guest-actions"><Link to="/auctions"><strong>Aukciók böngészése</strong><span>Nézd meg az aktuális tételeket</span></Link><Link to="/login"><strong>Belépés</strong><span>Folytasd a licitálást</span></Link><Link to="/register"><strong>Regisztráció</strong><span>Hozd létre a fiókodat</span></Link></div></section>;

  return <>
    <section className="container home-quick-actions" aria-labelledby="home-actions-title"><div className="section-heading"><div><span className="eyebrow">GYORS ELÉRÉS</span><h2 id="home-actions-title">Merre indulsz?</h2></div></div><div className="quick-action-grid">{memberActions.map(([label, to, detail]) => <Link to={to} key={to}><strong>{label}</strong><span>{detail}</span></Link>)}</div></section>
    {tasks.length ? <section className="container home-tasks" aria-labelledby="home-tasks-title"><div className="section-heading"><div><span className="eyebrow">TEENDŐID</span><h2 id="home-tasks-title">Ami most figyelmet kér</h2></div></div><div className="task-grid">{tasks.map((task) => <Link className={task.tone ? `task-card is-${task.tone}` : "task-card"} to={task.to} key={`${task.to}-${task.label}`}><strong>{task.label}</strong><span>{task.detail}</span></Link>)}</div></section> : null}
  </>;
}
