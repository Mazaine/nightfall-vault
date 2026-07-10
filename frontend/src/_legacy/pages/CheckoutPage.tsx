import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createCheckoutOrder } from "../api/checkout";
import { getAvailableShippingMethods } from "../api/shipping";
import { PickupPointSelector } from "../components/PickupPointSelector";
import { SiteHeader } from "../components/SiteHeader";
import { CaptchaWidget } from "../components/security/CaptchaWidget";
import { Button, Card, EmptyState, PageHeader } from "../components/ui";
import { bankTransferConfig } from "../config/payment";
import { useAuth } from "../hooks/useAuth";
import { useCaptcha } from "../hooks/useCaptcha";
import { useI18n } from "../i18n";
import type { CartItem, PickupPoint, ShippingMethod } from "../types";
import { formatHuf } from "../utils/format";
import "./CheckoutPage.css";

type CheckoutPageProps = { items: CartItem[]; onClear: () => void };
const paymentMethod = "bank_transfer";
function methodNeedsPickup(method?: ShippingMethod) { return Boolean(method && (method.code.includes("pickup") || method.code.includes("post") || method.code.includes("fox"))); }
function methodNeedsAddress(method?: ShippingMethod) { return Boolean(method && !methodNeedsPickup(method) && method.code !== "digital" && method.code !== "personal_pickup"); }

export function CheckoutPage({ items, onClear }: CheckoutPageProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { captchaToken, setCaptchaToken, resetCaptcha, isCaptchaEnabled } = useCaptcha();
  const navigate = useNavigate();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const productsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceHuf, 0);
  const [customerName, setCustomerName] = useState(user?.full_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(user?.email ?? "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingMethod, setShippingMethod] = useState("");
  const [selectedPickupPoint, setSelectedPickupPoint] = useState<PickupPoint | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const selectedShippingMethod = shippingMethods.find((method) => method.code === shippingMethod);
  const shippingPrice = selectedShippingMethod?.price ?? 0;
  const total = productsTotal + shippingPrice;
  const needsPickup = methodNeedsPickup(selectedShippingMethod);
  const needsAddress = methodNeedsAddress(selectedShippingMethod);
  const canSubmitOrder = useMemo(() => items.length > 0 && customerName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()) && shippingMethod && (!needsPickup || selectedPickupPoint) && (!needsAddress || (shippingZip && shippingCity && shippingAddress)) && (!isCaptchaEnabled || captchaToken) && !isSubmitting, [captchaToken, customerEmail, customerName, isCaptchaEnabled, isSubmitting, items.length, needsAddress, needsPickup, selectedPickupPoint, shippingAddress, shippingCity, shippingMethod, shippingZip]);

  useEffect(() => { if (items.length) getAvailableShippingMethods(items.map((item) => ({ product_id: item.product.id, quantity: item.quantity }))).then((response) => { setShippingMethods(response.methods); setShippingMethod(response.methods[0]?.code ?? ""); }).catch(() => setShippingMethods([])); }, [items]);

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitOrder) { setOrderError(t("checkout.fillRequired")); return; }
    setIsSubmitting(true); setOrderError(null);
    try { const order = await createCheckoutOrder({ customer_name: customerName.trim(), customer_email: customerEmail.trim(), customer_phone: customerPhone.trim() || null, shipping_method: shippingMethod, pickup_point_id: selectedPickupPoint?.id ?? null, shipping_zip: needsAddress ? shippingZip.trim() : null, shipping_city: needsAddress ? shippingCity.trim() : null, shipping_address: needsAddress ? shippingAddress.trim() : null, payment_method: paymentMethod, captcha_token: captchaToken, items: items.map((item) => ({ product_id: item.product.id, variant_id: item.variant?.id ?? null, quantity: item.quantity })) }); onClear(); navigate("/checkout/success", { state: { order } }); }
    catch { resetCaptcha(); setOrderError(t("common.error")); }
    finally { setIsSubmitting(false); }
  }

  return <main className="app-shell"><SiteHeader cartCount={cartCount} /><section className="page-content"><PageHeader eyebrow={t("checkout.title")} title={t("checkout.title")} lead={t("cart.summary")} />{items.length === 0 ? <EmptyState title={t("checkout.empty")} /> : <div className="checkout-layout"><form className="checkout-form" onSubmit={submitOrder}><Card className="checkout-panel"><h2>{t("checkout.customer")}</h2><label>{t("common.name")}<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label><label>{t("common.email")}<input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} required /></label><label>{t("common.phone")} <span>({t("common.optional")})</span><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></label></Card><Card className="checkout-panel"><h2>{t("checkout.shipping")}</h2><select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)}>{shippingMethods.map((method) => <option value={method.code} key={method.code}>{method.name} - {formatHuf(method.price)}</option>)}</select>{needsPickup ? <PickupPointSelector selectedCarrier="foxpost" selectedPickupPoint={selectedPickupPoint} onSelect={setSelectedPickupPoint} /> : null}{needsAddress ? <div className="checkout-address-grid"><input placeholder={t("checkout.zip")} value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} /><input placeholder={t("checkout.city")} value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} /><input placeholder={t("checkout.address")} value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} /></div> : null}</Card><Card className="checkout-panel"><h2>{t("checkout.payment")}</h2><p>{bankTransferConfig.accountName} | {bankTransferConfig.bankName} | {bankTransferConfig.accountNumber}</p><CaptchaWidget action="checkout" onTokenChange={setCaptchaToken} />{orderError ? <div className="checkout-error">{orderError}</div> : null}<Button type="submit" disabled={!canSubmitOrder}>{isSubmitting ? t("checkout.orderSaved") : t("checkout.placeOrder")}</Button></Card></form><Card className="checkout-summary"><h2>{t("cart.summary")}</h2>{items.map((item) => <div className="checkout-summary-row" key={`${item.product.id}-${item.variant?.id ?? "base"}`}><span>{item.product.name}</span><strong>{formatHuf(item.quantity * item.unitPriceHuf)}</strong></div>)}<div className="checkout-total"><span>{t("common.total")}</span><strong>{formatHuf(total)}</strong></div></Card></div>}</section></main>;
}
