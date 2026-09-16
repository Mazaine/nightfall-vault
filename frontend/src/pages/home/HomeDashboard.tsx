import { Link } from "react-router";
import { useAuth } from "../../AuthContext";
import type { HomeAuctionOverview } from "../../api/auctions";

type Task = { label: string; detail: string; to: string; tone?: "warning" | "success" };

export function HomeDashboard({ overview }: { overview: HomeAuctionOverview | null }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!overview) return null;
  if (!isAuthenticated) return <><section className="container home-tasks" aria-label="Ami most figyelmet kér"><div className="section-heading"><div><span className="eyebrow">MOST AKTUÁLIS</span><h2>Ami most figyelmet kér</h2></div></div><div className="task-grid"><Link className="task-card" to="/auctions?status=active"><strong>{overview?.active_count ?? 0} aktív aukció</strong><span>Fedezd fel, mire licitálhatsz most.</span></Link></div></section><section className="container home-quick-actions" aria-labelledby="home-actions-title"><div className="section-heading"><div><span className="eyebrow">KEZDD EL</span><h2 id="home-actions-title">Lépj be a boltozatba</h2></div></div><div className="quick-action-grid guest-actions"><Link to="/auctions"><strong>Aukciók böngészése</strong><span>Nézd meg az aktuális tételeket</span></Link><Link to="/login"><strong>Belépés</strong><span>Folytasd a licitálást</span></Link><Link to="/register"><strong>Regisztráció</strong><span>Hozd létre a fiókodat</span></Link></div></section></>;

  const tasks: Task[] = [{ label: `${overview?.active_count ?? 0} aktív aukció`, detail: "Fedezd fel, mire licitálhatsz most.", to: "/auctions?status=active" }];
  if (overview?.outbid_count) tasks.push({ label: `${overview.outbid_count} aukción túllicitáltak`, detail: "Még van időd újra licitálni.", to: "/my-bids?state=current", tone: "warning" });
  if (overview?.active_bid_count) tasks.push({ label: `${overview.active_bid_count} aktív licited van`, detail: "Nézd meg, hol állsz.", to: "/my-bids?state=current", tone: "success" });
  if (overview?.open_transaction_count) tasks.push({ label: `${overview.open_transaction_count} nyitott tranzakciód van`, detail: "Egyeztess, majd erősítsétek meg a lezárást.", to: "/account/transactions" });
  if (overview?.draft_count) tasks.push({ label: `${overview.draft_count} piszkozat vár befejezésre`, detail: "Folytasd ugyanazt a mentett aukciót.", to: "/account/auctions" });
  return <section className="container home-tasks" aria-labelledby="home-tasks-title"><div className="section-heading"><div><span className="eyebrow">TEENDŐID</span><h2 id="home-tasks-title">Ami most figyelmet kér</h2></div></div><div className="task-grid">{tasks.map((task) => <Link className={task.tone ? `task-card is-${task.tone}` : "task-card"} to={task.to} key={task.to + task.label}><strong>{task.label}</strong><span>{task.detail}</span></Link>)}</div></section>;
}
