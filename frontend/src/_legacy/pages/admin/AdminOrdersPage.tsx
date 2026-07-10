import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminOrders } from "../../api/admin";
import { AdminLayout } from "../../components/AdminLayout";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { Order, OrderStatus } from "../../types";
import { formatHuf } from "../../utils/format";
import "./AdminOrdersPage.css";

type AdminOrdersPageProps = { cartCount: number };
const statuses: Array<OrderStatus | ""> = ["", "pending_payment", "processing", "completed", "cancelled"];

export function AdminOrdersPage({ cartCount }: AdminOrdersPageProps) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(false);
    getAdminOrders({ search: searchTerm.trim() || undefined, status: statusFilter || undefined })
      .then(setOrders)
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }, [searchTerm, statusFilter]);

  const stats = useMemo(() => ({ total: orders.length, pending: orders.filter((order) => order.status === "pending_payment").length, revenue: orders.reduce((sum, order) => sum + order.total_amount, 0) }), [orders]);

  return (
    <AdminLayout cartCount={cartCount}>
      <section className="admin-orders-page">
        <PageHeader eyebrow="Admin" title={t("admin.orders")} lead={t("admin.manageOrders")} />
        <div className="admin-order-stats"><span>{t("admin.totalOrders")}: {stats.total}</span><span>{t("admin.pendingOrders")}: {stats.pending}</span><span>{t("admin.revenue")}: {formatHuf(stats.revenue)}</span></div>
        <div className="admin-order-toolbar"><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t("common.search")} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "")}><option value="">{t("common.status")}</option>{statuses.filter(Boolean).map((status) => <option value={status} key={status}>{status}</option>)}</select></div>
        {isLoading ? <LoadingState text={t("states.loadingOrders")} /> : null}
        {error ? <ErrorState title={t("states.orderError")} /> : null}
        {!isLoading && !error && orders.length === 0 ? <EmptyState title={t("orders.empty")} /> : null}
        <div className="admin-orders-list">{orders.map((order) => <article className="admin-order-row" key={order.id}><div><strong>{order.order_number}</strong><span>{order.customer_name} - {order.customer_email}</span></div><Badge>{order.status}</Badge><span>{formatHuf(order.total_amount)}</span><span>{new Date(order.created_at).toLocaleDateString()}</span><Link to={`/admin/orders/${order.id}`}>{t("common.details")}</Link></article>)}</div>
      </section>
    </AdminLayout>
  );
}
