import { useCallback, useEffect, useState } from "react";
import { getAdminStats, type AdminStats } from "../../api/admin";
import { AdminStatCard } from "./AdminStatCard";
import { ErrorState, LoadingState } from "../../components/AsyncStates";

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setStats(await getAdminStats()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Az adminadatok betöltése nem sikerült."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="admin-page" aria-labelledby="admin-dashboard-title">
      <div className="section-heading page-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 id="admin-dashboard-title">Áttekintés</h1>
          <p className="section-note">A Nightfall Vault aktuális működési és moderációs állapota.</p>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!stats && !error ? <LoadingState label="Adminadatok betöltése" cards={4} /> : null}
      {stats ? (
        <div className="info-grid admin-stat-grid">
          <AdminStatCard value={String(stats.active_auctions)} title="Aktív aukció" text={`${stats.today_auctions} új aukció ma.`} />
          <AdminStatCard value={String(stats.open_reports)} title="Nyitott jelentés" text="Moderátori ellenőrzésre vár." />
          <AdminStatCard value={String(stats.total_users)} title="Felhasználó" text={`${stats.new_users} új fiók az elmúlt 7 napban.`} />
          <AdminStatCard value={String(stats.sold_auctions)} title="Eladott aukció" text={`${stats.total_auctions} aukció összesen.`} />
        </div>
      ) : null}
    </section>
  );
}
