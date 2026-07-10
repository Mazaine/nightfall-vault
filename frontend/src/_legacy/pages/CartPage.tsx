import { Link } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { Button, Card, EmptyState, PageHeader } from "../components/ui";
import { useI18n } from "../i18n";
import type { CartItem } from "../types";
import { formatHuf } from "../utils/format";
import "./CartPage.css";

type CartPageProps = { items: CartItem[]; onIncrease: (productId: number, variantId?: number | null) => void; onDecrease: (productId: number, variantId?: number | null) => void; onRemove: (productId: number, variantId?: number | null) => void; onClear: () => void };

export function CartPage({ items, onIncrease, onDecrease, onRemove, onClear }: CartPageProps) {
  const { t } = useI18n();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceHuf, 0);
  return <main className="app-shell"><SiteHeader cartCount={cartCount} /><section className="page-content"><PageHeader eyebrow={t("nav.cart")} title={t("cart.title")} lead={t("cart.summary")} />{items.length === 0 ? <EmptyState title={t("cart.empty")} text={t("cart.continueShopping")} /> : <div className="cart-layout"><div className="cart-items">{items.map((item) => { const variantId = item.variant?.id ?? null; return <Card className="cart-item" key={`${item.product.id}-${variantId ?? "base"}`}><div><h3>{item.product.name}</h3>{item.variant ? <p>{item.variant.name}</p> : null}<span>{formatHuf(item.unitPriceHuf)} / {t("cart.item")}</span></div><div className="quantity-control"><button type="button" onClick={() => onDecrease(item.product.id, variantId)}>-</button><strong>{item.quantity}</strong><button type="button" onClick={() => onIncrease(item.product.id, variantId)}>+</button></div><strong>{formatHuf(item.quantity * item.unitPriceHuf)}</strong><Button variant="ghost" type="button" onClick={() => onRemove(item.product.id, variantId)}>{t("common.remove")}</Button></Card>; })}</div><Card className="cart-summary"><span>{t("common.total")}</span><strong>{formatHuf(total)}</strong><Link className="primary-action" to="/checkout">{t("common.checkout")}</Link><Button variant="secondary" type="button" onClick={onClear}>{t("cart.clear")}</Button></Card></div>}</section></main>;
}
