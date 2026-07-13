import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAdminReports, updateAdminReportNote, updateAdminReportPriority, updateAdminReportStatus, type AdminReportRead, type ReportPriority, type ReportStatus } from "../../api/reports";
import { formatLocalDateTime } from "../../utils/format";

const statuses: ReportStatus[] = ["open", "under_review", "resolved", "dismissed"];
const priorities: ReportPriority[] = ["low", "normal", "high", "urgent"];

export function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReportRead[]>([]);
  const [selected, setSelected] = useState<AdminReportRead | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = async () => {
    setIsLoading(true);
    setMessage("");
    try {
      const page = await listAdminReports({ status: statusFilter, target_type: targetFilter, limit: 50, sort: "newest" });
      setReports(page.items);
      setSelected((current) => current ? page.items.find((item) => item.id === current.id) ?? page.items[0] ?? null : page.items[0] ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A jelentesek betoltese nem sikerult.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadReports(); }, [statusFilter, targetFilter]);

  const updateSelected = async (next: Promise<AdminReportRead>) => {
    try {
      const updated = await next;
      setSelected(updated);
      setReports((items) => items.map((item) => item.id === updated.id ? updated : item));
      setMessage("Jelentes frissitve.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A frissites nem sikerult.");
    }
  };

  return (
    <section className="admin-page">
      <div className="section-heading page-heading">
        <div>
          <p className="eyebrow">Trust & Safety</p>
          <h1>Jelentesek</h1>
          <p className="section-note">Moderacios sor, prioritas es statuszkezeles.</p>
        </div>
      </div>

      <div className="side-panel admin-filter-row">
        <label>Statusz <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Osszes</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>Cel <select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="">Osszes</option><option value="auction">Aukcio</option><option value="user">Felhasznalo</option></select></label>
      </div>

      {message ? <p className="form-message">{message}</p> : null}
      {isLoading ? <div className="side-panel">Jelentesek betoltese...</div> : null}
      {!isLoading && reports.length === 0 ? <div className="side-panel empty-state">Nincs megjelenitheto jelentes.</div> : null}

      <div className="admin-report-layout">
        <div className="compact-auction-list">
          {reports.map((report) => (
            <button className="compact-auction-row report-row-button" type="button" key={report.id} onClick={() => setSelected(report)}>
              <strong>#{report.id} {report.target_type}</strong>
              <span>{report.reason}</span>
              <span>{report.status} / {report.priority}</span>
              <span>{formatLocalDateTime(report.created_at)}</span>
            </button>
          ))}
        </div>

        {selected ? (
          <article className="side-panel report-detail-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">#{selected.id}</p>
                <h2>{selected.target_type === "auction" ? selected.auction_title ?? "Aukcio" : selected.reported_username}</h2>
              </div>
            </div>
            <dl className="detail-list">
              <div><dt>Reporter</dt><dd>{selected.reporter_username}</dd></div>
              <div><dt>Statusz</dt><dd>{selected.status}</dd></div>
              <div><dt>Prioritas</dt><dd>{selected.priority}</dd></div>
              <div><dt>Ok</dt><dd>{selected.reason}</dd></div>
              <div><dt>Letrehozva</dt><dd>{formatLocalDateTime(selected.created_at)}</dd></div>
            </dl>
            {selected.auction_id ? <Link className="text-link" to={`/auctions/${selected.auction_id}`}>Aukcio megnyitasa</Link> : null}
            {selected.reported_username ? <Link className="text-link" to={`/users/${selected.reported_username}`}>Felhasznalo megnyitasa</Link> : null}
            <p className="section-note">Felhasznaloi reszletek: {selected.details || "Nincs megadva."}</p>
            <label>Statusz <select value={selected.status} onChange={(event) => updateSelected(updateAdminReportStatus(selected.id, event.target.value as ReportStatus))}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label>Prioritas <select value={selected.priority} onChange={(event) => updateSelected(updateAdminReportPriority(selected.id, event.target.value as ReportPriority))}>{priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
            <label>Admin jegyzet <textarea rows={4} defaultValue={selected.admin_note ?? ""} onBlur={(event) => updateSelected(updateAdminReportNote(selected.id, event.target.value))} /></label>
          </article>
        ) : null}
      </div>
    </section>
  );
}
