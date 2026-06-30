import { Link, useLocation } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { bankTransferConfig } from "../config/payment";
import type { OrderDetail } from "../types";
import "./CheckoutPage.css";

type CheckoutSuccessPageProps = {
  cartCount: number;
};

const statusLabels: Record<string, string> = {
  pending_payment: "Fizetésre vár",
  processing: "Feldolgozás alatt",
  completed: "Teljesítve",
  cancelled: "Törölve",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "Fizetésre vár",
  paid: "Fizetve",
  failed: "Sikertelen",
  refunded: "Visszatérítve",
};

const paymentMethodLabels: Record<string, string> = {
  bank_transfer: "Banki utalás",
};

export function CheckoutSuccessPage({ cartCount }: CheckoutSuccessPageProps) {
  const location = useLocation();
  const order = (location.state as { order?: OrderDetail } | null)?.order;
  const orderNumber = order?.order_number ?? "A rendelés száma";

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="checkout-page page-content">
        <div className="checkout-success">
          <p className="eyebrow">Sikeres rendelés</p>
          <h1>Köszönjük a rendelésed!</h1>

          {order ? (
            <>
              <p>
                A rendelésed bekerült a rendszerbe. Rendelésszám:{" "}
                <strong>{order.order_number}</strong>
              </p>
              <p>
                Fizetési mód:{" "}
                <strong>{paymentMethodLabels[order.payment_method] ?? order.payment_method}</strong>
              </p>
              <p>
                Rendelés állapota: <strong>{statusLabels[order.status] ?? order.status}</strong>
              </p>
              <p>
                Fizetés állapota:{" "}
                <strong>{paymentStatusLabels[order.payment_status] ?? order.payment_status}</strong>
              </p>
              <p>
                Szállítási díj: <strong>{order.shipping_price.toLocaleString("hu-HU")} Ft</strong>
              </p>
              <p>
                Végösszeg: <strong>{order.total_amount.toLocaleString("hu-HU")} Ft</strong>
              </p>
            </>
          ) : (
            <p>A rendelésed rögzítése megtörtént. A részleteket az admin felületen tudod ellenőrizni.</p>
          )}

          <section className="bank-transfer-box" aria-label="Utalási adatok">
            <h2>Utalási adatok</h2>
            <dl>
              <dt>Kedvezményezett neve</dt>
              <dd>{bankTransferConfig.accountName}</dd>
              <dt>Bank</dt>
              <dd>{bankTransferConfig.bankName}</dd>
              <dt>Bankszámlaszám</dt>
              <dd>{bankTransferConfig.accountNumber}</dd>
              <dt>Közlemény</dt>
              <dd>{orderNumber}</dd>
            </dl>
          </section>

          <div className="checkout-success-actions">
            <Link className="primary-action" to="/category/hatalom-kartyai-kartyajatek">
              Vissza a termékekhez
            </Link>
            <Link className="secondary-action" to="/">
              Főoldal
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
