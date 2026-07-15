import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auctionReportReasons, listMyReports, userReportReasons, type ReportRead, type ReportStatus } from "../api/reports";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { formatLocalDateTime } from "../utils/format";

const statusLabels: Record<ReportStatus, string> = {
  open: "Beérkezett",
  under_review: "Vizsgálat alatt",
  resolved: "Lezárva",
  dismissed: "Elutasítva",
};

const reasonLabels = new Map(
  [...auctionReportReasons, ...userReportReasons].map((reason) => [reason.value, reason.label]),
);

function reportTarget(report: ReportRead) {
  if (report.target_type === "auction") {
    return {
      kind: "Aukciójelentés",
      title: report.auction?.title ?? report.auction_title ?? "Már nem elérhető aukció",
      path: report.auction_id ? `/auctions/${report.auction_id}` : null,
      action: "Aukció megnyitása",
    };
  }
  const username = report.reported_user?.username ?? report.reported_username ?? null;
  return {
    kind: "Profiljelentés",
    title: report.reported_user?.full_name || (username ? `@${username}` : "Már nem elérhető profil"),
    path: username ? `/users/${username}` : null,
    action: "Profil megnyitása",
  };
}

export function AccountReportsPage() {
  const [items, setItems] = useState<ReportRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setItems((await listMyReports({ limit: 50 })).items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A jelentések betöltése nem sikerült.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div className="section-heading page-heading compact-page-heading reports-page-heading">
        <div>
          <p className="eyebrow">Biztonság és moderáció</p>
          <h1>Jelentéseim</h1>
          <p className="section-note">Itt követheted a korábban beküldött aukció- és profiljelentéseid állapotát.</p>
        </div>
      </div>

      {isLoading ? <LoadingState label="Jelentések betöltése" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && !error && items.length === 0 ? <EmptyState title="Még nincs jelentésed" action={<Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>} /> : null}

      <div className="list-panel reports-list">
        {items.map((report) => {
          const target = reportTarget(report);
          const statusClass = report.status.replace("_", "-");
          return (
            <article className="side-panel report-summary" key={report.id}>
              <div className="report-card-header">
                <div>
                  <p className="report-card-kind">{target.kind} <span>#{report.id}</span></p>
                  <h2>{target.title}</h2>
                  {report.target_type === "user" && report.reported_user?.username ? <small>@{report.reported_user.username}</small> : null}
                </div>
                <span className={`report-status is-${statusClass}`}>{statusLabels[report.status]}</span>
              </div>

              <dl className="report-meta-grid">
                <div>
                  <dt>Jelentés oka</dt>
                  <dd>{reasonLabels.get(report.reason) ?? "Egyéb"}</dd>
                </div>
                <div>
                  <dt>Beküldve</dt>
                  <dd><time dateTime={report.created_at}>{formatLocalDateTime(report.created_at)}</time></dd>
                </div>
              </dl>

              {report.details ? <div className="report-details"><strong>Megjegyzésed</strong><p>{report.details}</p></div> : null}
              {report.public_resolution ? <div className="report-resolution"><strong>Moderátori válasz</strong><p>{report.public_resolution}</p></div> : null}

              <div className="report-card-footer">
                {target.path ? <Link className="button button-secondary" to={target.path}>{target.action}</Link> : <span className="section-note">A jelentett cél már nem érhető el.</span>}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
