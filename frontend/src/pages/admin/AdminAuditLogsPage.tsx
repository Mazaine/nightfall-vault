import { useCallback, useEffect, useState } from "react";
import { listAuditLogs, type AuditLogEntry } from "../../api/admin";
import { formatLocalDateTime } from "../../utils/format";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncStates";

const auditActionLabels: Record<string, string> = {
  auction_created: "Aukció létrehozása",
  auction_activated: "Aukció aktiválása",
  auction_status_changed: "Aukcióállapot módosítása",
  auction_message_sent: "Aukciós üzenet elküldése",
  auction_bid: "Licit rögzítése",
  auction_buy_now: "Villámáras lezárás",
  auction_moderated_suspend: "Aukció felfüggesztése",
  auction_moderated_restore: "Aukció visszaállítása",
  auction_moderated_delete: "Aukció törlése",
  report_created: "Jelentés létrehozása",
  report_status_changed: "Jelentés állapotának módosítása",
  report_priority_changed: "Jelentés prioritásának módosítása",
  report_note_changed: "Adminjegyzet módosítása",
  transaction_created: "Tranzakció létrehozása",
  transaction_completion_confirmed: "Tranzakció teljesítésének megerősítése",
  transaction_completed: "Tranzakció lezárása",
  transaction_reviewed: "Tranzakció értékelése",
  transaction_archived: "Tranzakció archiválása",
  user_block_created: "Felhasználó blokkolása",
  user_block_removed: "Felhasználó blokkolásának feloldása",
  moderation_strike_issued: "Figyelmeztető pont kiadása",
  moderation_strike_threshold_reached: "Figyelmeztetőpont-határ elérése",
  moderation_strike_revoked: "Figyelmeztető pont visszavonása",
  moderation_restriction_revoked: "Moderációs korlátozás visszavonása",
  moderation_permanent_ban_revoked: "Végleges tiltás visszavonása",
};

function formatAuditAction(action: string) {
  if (auditActionLabels[action]) return auditActionLabels[action];
  if (/^(GET|POST|PUT|PATCH|DELETE)\s/i.test(action)) return "Adminisztrátori művelet";
  return "Rendszerművelet";
}

function formatRequestMethod(method: string | null, path: string | null) {
  if (!method || !path) return "–";
  const methodLabels: Record<string, string> = { GET: "Lekérés", POST: "Létrehozás", PUT: "Frissítés", PATCH: "Módosítás", DELETE: "Törlés" };
  return `${methodLabels[method] ?? "Művelet"}: ${path}`;
}

function formatResponse(statusCode: number | null) {
  if (statusCode === null) return "Nincs válaszadat";
  if (statusCode >= 200 && statusCode < 300) return "Sikeres";
  if (statusCode >= 300 && statusCode < 400) return "Átirányítva";
  if (statusCode >= 400 && statusCode < 500) return "Elutasítva";
  return "Kiszolgálóhiba";
}

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try { setLogs((await listAuditLogs()).items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Az auditnapló betöltése nem sikerült."); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="admin-page" aria-labelledby="admin-audit-title">
      <div className="section-heading page-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 id="admin-audit-title">Auditnapló</h1>
          <p className="section-note">A rendszer és az adminisztráció legutóbbi naplózott műveletei.</p>
        </div>
      </div>
      {isLoading ? <LoadingState label="Auditnapló betöltése" cards={2} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && !error && logs.length === 0 ? <EmptyState title="Még nincs auditbejegyzés" /> : null}
      {logs.length > 0 ? (
        <div className="side-panel admin-table-panel" tabIndex={0} aria-label="Az auditnapló vízszintesen görgethető táblázata">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Időpont</th>
                <th>Művelet</th>
                <th>Felhasználó</th>
                <th>Aukció</th>
                <th>Végpont</th>
                <th>Válasz</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatLocalDateTime(log.created_at)}</td>
                  <td>{formatAuditAction(log.action)}</td>
                  <td>{log.user_id ?? "–"}</td>
                  <td>{log.auction_id ?? "–"}</td>
                  <td>{formatRequestMethod(log.method, log.path)}</td>
                  <td>{formatResponse(log.status_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
