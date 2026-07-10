import { AdminStatCard } from "./AdminStatCard";

export function AdminDashboardPage() {
  return (
    <div>
      <h1>Admin dashboard</h1>
      <div className="info-grid">
        <AdminStatCard
          value="12"
          title="Aktív termék"
          text="Katalógus áttekintés."
        />
        <AdminStatCard
          value="4"
          title="Új rendelés"
          text="Feldolgozásra vár."
        />
        <AdminStatCard
          value="8"
          title="Felhasználó"
          text="Regisztrált minta fiókok."
        />
      </div>
    </div>
  );
}
