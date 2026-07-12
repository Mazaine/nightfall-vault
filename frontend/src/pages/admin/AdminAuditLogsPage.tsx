import { useEffect, useState } from "react";
import { listAuditLogs, type AuditLogEntry } from "../../api/admin";

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listAuditLogs()
      .then(setLogs)
      .catch((err) => setError(err instanceof Error ? err.message : "Az audit naplo betoltese nem sikerult."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1>Audit naplo</h1>
      {isLoading ? <div className="side-panel">Audit naplo betoltese...</div> : null}
      {error ? <div className="side-panel form-message">{error}</div> : null}
      {!isLoading && !error && logs.length === 0 ? <div className="side-panel">Meg nincs audit bejegyzes.</div> : null}
      {logs.length > 0 ? (
        <div className="side-panel admin-table-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Idopont</th>
                <th>Muvelet</th>
                <th>Felhasznalo</th>
                <th>Aukcio</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString("hu-HU")}</td>
                  <td>{log.action}</td>
                  <td>{log.user_id ?? "-"}</td>
                  <td>{log.auction_id ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
