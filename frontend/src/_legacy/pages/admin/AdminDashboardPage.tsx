import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminStats } from "../../api/admin";
import { AdminLayout } from "../../components/AdminLayout";
import { Card, PageHeader } from "../../components/ui";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n";
import type { AdminStats } from "../../types";
import { formatHuf } from "../../utils/format";
import "./AdminDashboardPage.css";

type AdminDashboardPageProps = { cartCount: number };

export function AdminDashboardPage({ cartCount }: AdminDashboardPageProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => { getAdminStats().then(setStats).catch(() => setStats(null)); }, []);
  const adminCards = useMemo(() => [
    { title: t("admin.products"), description: t("admin.manageProducts"), to: "/admin/products" },
    { title: t("admin.orders"), description: t("admin.manageOrders"), to: "/admin/orders" },
    { title: t("admin.users"), description: t("admin.manageUsers"), to: "/admin/users" },
    { title: t("admin.shipping"), description: t("admin.shipping"), to: "/admin/shipping" },
    { title: t("admin.newsletters"), description: t("admin.newsletters"), to: "/admin/newsletters" },
  ], [t]);

  return (
    <AdminLayout cartCount={cartCount}>
      <section className="admin-dashboard">
        <PageHeader eyebrow="Admin" title={t("admin.dashboard")} lead={`${t("admin.signedIn")}: ${user?.full_name ?? user?.email ?? "-"}. ${t("admin.adminLead")}`} />
        {stats ? <div className="admin-stat-grid"><article><span>{t("admin.todayOrders")}</span><strong>{stats.today_orders}</strong></article><article><span>{t("admin.weekOrders")}</span><strong>{stats.week_orders}</strong></article><article><span>{t("admin.pendingOrders")}</span><strong>{stats.pending_orders}</strong></article><article><span>{t("admin.revenue")}</span><strong>{formatHuf(stats.completed_revenue)}</strong></article><article><span>{t("admin.totalUsers")}</span><strong>{stats.total_users}</strong></article><article><span>{t("admin.totalProducts")}</span><strong>{stats.total_products}</strong></article><article className={stats.low_stock_products > 0 ? "warning" : ""}><span>{t("admin.lowStock")}</span><strong>{stats.low_stock_products}</strong></article></div> : null}
        <div className="admin-card-grid">{adminCards.map((card) => <Card className="admin-card" key={card.to}><h2>{card.title}</h2><p>{card.description}</p><Link to={card.to}>{t("common.open")}</Link></Card>)}</div>
      </section>
    </AdminLayout>
  );
}
