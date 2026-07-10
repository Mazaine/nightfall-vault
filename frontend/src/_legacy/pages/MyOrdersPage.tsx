import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMyOrder, getMyOrders } from "../api/orders";
import { SiteHeader } from "../components/SiteHeader";
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useI18n } from "../i18n";
import type { Order, OrderDetail } from "../types";
import { formatHuf } from "../utils/format";
import "./MyOrdersPage.css";

type MyOrdersPageProps = { cartCount: number };

export function MyOrdersPage({ cartCount }: MyOrdersPageProps) {
  const { id } = useParams();
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(false);
    const request = id ? getMyOrder(Number(id)).then((order) => { setDetail(order); setOrders([]); }) : getMyOrders().then((items) => { setOrders(items); setDetail(null); });
    request.catch(() => setError(true)).finally(() => setIsLoading(false));
  }, [id]);

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="orders-page page-content">
        <PageHeader eyebrow={t("nav.orders")} title={t("orders.title")} lead={t("orders.lead")} />
        {isLoading ? <LoadingState text={t("states.loadingOrders")} /> : null}
        {error ? <ErrorState title={t("states.orderError")} /> : null}
        {!isLoading && !error && !detail && orders.length === 0 ? <EmptyState title={t("orders.empty")} /> : null}
        {detail ? <Card className="order-detail-card"><div className="order-detail-head"><h2>{detail.order_number}</h2><Badge>{detail.status}</Badge></div><dl><dt>{t("common.total")}</dt><dd>{formatHuf(detail.total_amount)}</dd><dt>{t("checkout.shipping")}</dt><dd>{detail.shipping_method}</dd><dt>{t("orders.items")}</dt><dd>{detail.items.length}</dd></dl>{detail.items.map((item) => <div className="order-line" key={item.id}><span>{item.product_name}</span><span>{item.quantity} {t("common.pcs")}</span><strong>{formatHuf(item.total_price)}</strong></div>)}</Card> : null}
        <div className="orders-list">
          {orders.map((order) => <Card className="order-card" key={order.id}><div><span>{t("orders.orderNumber")}</span><strong>{order.order_number}</strong></div><Badge>{order.status}</Badge><span>{new Date(order.created_at).toLocaleDateString()}</span><strong>{formatHuf(order.total_amount)}</strong><Link to={`/my-orders/${order.id}`}>{t("common.details")}</Link></Card>)}
        </div>
      </section>
    </main>
  );
}
