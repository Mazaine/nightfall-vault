import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getAdminOrder, updateAdminOrderStatus } from "../../api/admin";
import { AdminLayout } from "../../components/AdminLayout";
import type { OrderDetail, OrderStatus } from "../../types";
import { formatHuf } from "../../utils/format";

type AdminOrderDetailPageProps = { cartCount: number };
const statuses: OrderStatus[] = ["pending_payment", "processing", "completed", "cancelled"];

export function AdminOrderDetailPage({ cartCount }: AdminOrderDetailPageProps) {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  useEffect(() => { if (id) getAdminOrder(Number(id)).then(setOrder).catch(() => setOrder(null)); }, [id]);
  async function changeStatus(status: OrderStatus) { if (!order) return; const updated = await updateAdminOrderStatus(order.id, status); setOrder(updated); }
  if (!order) return <AdminLayout cartCount={cartCount}><section className="admin-order-detail"><p>Order not found.</p></section></AdminLayout>;
  return <AdminLayout cartCount={cartCount}><section className="admin-order-detail"><div className="admin-hero"><p className="eyebrow">Order</p><h1>{order.order_number}</h1><p className="lead">{order.customer_name} - {order.customer_email}</p></div><label>Status <select value={order.status} onChange={(event) => changeStatus(event.target.value as OrderStatus)}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><dl className="order-detail-grid"><dt>Total</dt><dd>{formatHuf(order.total_amount)}</dd><dt>Shipping</dt><dd>{order.shipping_method} ({formatHuf(order.shipping_price)})</dd><dt>Payment</dt><dd>{order.payment_method} / {order.payment_status}</dd></dl><div className="order-items-card"><h2>Items</h2>{order.items.map((item) => <article key={item.id}><span>{item.product_name}</span><span>{item.quantity} pcs</span><strong>{formatHuf(item.total_price)}</strong></article>)}</div></section></AdminLayout>;
}

