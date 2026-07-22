import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auctionReportReasons, listAdminReports, updateAdminReportNote, updateAdminReportPriority, updateAdminReportStatus, userReportReasons, type AdminReportRead, type ReportPriority, type ReportStatus } from "../../api/reports";
import { formatLocalDateTime } from "../../utils/format";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncStates";

const statuses: ReportStatus[] = ["open", "under_review", "resolved", "dismissed"];
const priorities: ReportPriority[] = ["low", "normal", "high", "urgent"];
const statusLabels: Record<ReportStatus, string> = { open: "Nyitott", under_review: "Vizsgálat alatt", resolved: "Megoldva", dismissed: "Elutasítva" };
const priorityLabels: Record<ReportPriority, string> = { low: "Alacsony", normal: "Normál", high: "Magas", urgent: "Sürgős" };
const reasonLabels = new Map([...auctionReportReasons, ...userReportReasons].map((reason) => [reason.value, reason.label]));

export function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReportRead[]>([]);
  const [selected, setSelected] = useState<AdminReportRead | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = async () => {
    setIsLoading(true);
    setMessage("");
    setError("");
    try {
      const page = await listAdminReports({ status: statusFilter, target_type: targetFilter, limit: 50, sort: "newest" });
      setReports(page.items);
      setSelected((current) => current ? page.items.find((item) => item.id === current.id) ?? page.items[0] ?? null : page.items[0] ?? null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "A jelentések betöltése nem sikerült.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadReports(); }, [statusFilter, targetFilter]);

  const updateSelected = async (next: Promise<AdminReportRead>, successMessage: string) => {
    try {
      const updated = await next;
      setSelected(updated);
      setReports((items) => items.map((item) => item.id === updated.id ? updated : item));
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A frissítés nem sikerült.");
    }
  };

  return (
    <section className="admin-page" aria-labelledby="admin-reports-title">
      <div className="section-heading page-heading">
        <div>
          <p className="eyebrow">Biztonság és moderáció</p>
          <h1 id="admin-reports-title">Jelentések</h1>
          <p className="section-note">Moderációs sor, prioritás- és státuszkezelés.</p>
        </div>
      </div>

      <div className="side-panel admin-filter-row">
        <label>Státusz <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Összes</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        <label>Cél <select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="">Összes</option><option value="auction">Aukció</option><option value="user">Felhasználó</option></select></label>
      </div>

      {message ? <p className="form-message" role="status">{message}</p> : null}
      {isLoading ? <LoadingState label="Jelentések betöltése" cards={2} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void loadReports()} /> : null}
      {!isLoading && !error && reports.length === 0 ? <EmptyState title="Nincs a szűrésnek megfelelő jelentés" action={<button className="button button-secondary" type="button" onClick={() => { setStatusFilter(""); setTargetFilter(""); }}>Szűrők törlése</button>} /> : null}

      <div className="admin-report-layout" aria-busy={isLoading}>
        <div className="compact-auction-list" aria-label="Jelentéssor">
          {reports.map((report) => (
            <button className={`compact-auction-row report-row-button${selected?.id === report.id ? " is-selected" : ""}`} type="button" key={report.id} onClick={() => setSelected(report)} aria-pressed={selected?.id === report.id}>
              <strong>#{report.id} · {report.target_type === "auction" ? "Aukció" : "Felhasználó"}</strong>
              <span>{reasonLabels.get(report.reason) ?? "Egyéb"}</span>
              <span>{statusLabels[report.status]} · {priorityLabels[report.priority]}</span>
              <span>{formatLocalDateTime(report.created_at)}</span>
            </button>
          ))}
        </div>

        {selected ? (
          <article className="side-panel report-detail-panel" aria-label={`A(z) ${selected.id}. jelentés részletei`}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Jelentés #{selected.id}</p>
                <h2>{selected.target_type === "auction" ? selected.auction_title ?? "Aukció" : selected.reported_username}</h2>
              </div>
            </div>
            <dl className="detail-list">
              <div><dt>Bejelentő</dt><dd>{selected.reporter_username}</dd></div>
              <div><dt>Státusz</dt><dd>{statusLabels[selected.status]}</dd></div>
              <div><dt>Prioritás</dt><dd>{priorityLabels[selected.priority]}</dd></div>
              <div><dt>Ok</dt><dd>{reasonLabels.get(selected.reason) ?? "Egyéb"}</dd></div>
              <div><dt>Létrehozva</dt><dd>{formatLocalDateTime(selected.created_at)}</dd></div>
            </dl>
            {selected.auction_id ? <Link className="text-link" to={`/auctions/${selected.auction_id}`}>Aukció megnyitása</Link> : null}
            {selected.reported_username ? <Link className="text-link" to={`/users/${selected.reported_username}`}>Felhasználó megnyitása</Link> : null}
            <p className="section-note">Felhasználói részletek: {selected.details || "Nincs megadva."}</p>
            <label>Státusz <select value={selected.status} onChange={(event) => void updateSelected(updateAdminReportStatus(selected.id, event.target.value as ReportStatus), "A jelentés státusza frissült.")}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
            <label>Prioritás <select value={selected.priority} onChange={(event) => void updateSelected(updateAdminReportPriority(selected.id, event.target.value as ReportPriority), "A jelentés prioritása frissült.")}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label>
            <label>Adminjegyzet <textarea key={selected.id} rows={4} defaultValue={selected.admin_note ?? ""} onBlur={(event) => void updateSelected(updateAdminReportNote(selected.id, event.target.value), "Az adminjegyzet mentve.")} /></label>
          </article>
        ) : null}
      </div>
    </section>
  );
}
