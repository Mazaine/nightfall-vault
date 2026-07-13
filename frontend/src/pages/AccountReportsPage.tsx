import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyReports, type ReportRead } from "../api/reports";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";

export function AccountReportsPage() {
  const [items, setItems] = useState<ReportRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setIsLoading(true); setError("");
    try { setItems((await listMyReports({ limit: 50 })).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "A jelentések betöltése nem sikerült."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <><div className="section-heading page-heading compact-page-heading"><div><p className="eyebrow">Trust & Safety</p><h1>Jelentéseim</h1><p className="section-note">A korábban beküldött aukció- és profiljelentéseid állapota.</p></div></div>{isLoading ? <LoadingState label="Jelentések betöltése" /> : null}{error ? <ErrorState message={error} onRetry={() => void load()} /> : null}{!isLoading && !error && items.length === 0 ? <EmptyState title="Még nincs jelentésed" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}<div className="list-panel">{items.map((report) => <article className="side-panel report-summary" key={report.id}><h2>#{report.id} {report.target_type === "auction" ? report.auction_title ?? "Aukció" : report.reported_username}</h2><p><strong>Ok:</strong> {report.reason}</p><p><strong>Állapot:</strong> {report.status}</p>{report.public_resolution ? <p>{report.public_resolution}</p> : null}</article>)}</div></>;
}
