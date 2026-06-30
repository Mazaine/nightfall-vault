import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProduct } from "../../api/products";
import { SiteHeader } from "../../components/SiteHeader";
import { Badge, Button, EmptyState, LoadingState } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { AddToCartHandler, Product, ProductVariant } from "../../types";
import { formatHuf } from "../../utils/format";
import { getAvailableCartQuantity, getVariantCheckoutPrice, isProductSoldOut } from "../../utils/cart";
import "./ProductPage.css";

type ProductPageProps = { cartCount: number; onAddToCart: AddToCartHandler };

export function ProductPage({ cartCount, onAddToCart }: ProductPageProps) {
  const { t } = useI18n();
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => { if (slug) { setIsLoading(true); getProduct(slug).then(setProduct).catch(() => setProduct(null)).finally(() => setIsLoading(false)); } }, [slug]);

  if (isLoading) return <main className="app-shell"><SiteHeader cartCount={cartCount} /><section className="page-content"><LoadingState text={t("states.loadingProducts")} /></section></main>;
  if (!product) return <main className="app-shell"><SiteHeader cartCount={cartCount} /><section className="page-content"><EmptyState title={t("states.notFoundTitle")} text={t("states.notFoundLead")} /></section></main>;

  const activeVariants = product.variants.filter((variant) => variant.is_active);
  const variant = selectedVariant ?? null;
  const availableQuantity = getAvailableCartQuantity(product, variant);
  const soldOut = isProductSoldOut(product, variant);

  return <main className="app-shell"><SiteHeader cartCount={cartCount} /><section className="product-detail page-content"><div className="product-detail-media">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <span className="media-mark">WT</span>}</div><div className="product-detail-content"><Link className="back-link" to="/products">{t("common.back")}</Link><p className="eyebrow">{t("products.productDetails")}</p><h1>{product.name}</h1><p className="lead">{product.short_description ?? t("products.lead")}</p><div className="detail-price-row"><strong>{formatHuf(getVariantCheckoutPrice(product, variant))}</strong>{product.is_featured ? <Badge>{t("products.featured")}</Badge> : null}</div>{activeVariants.length > 0 ? <label className="detail-field"><span>{t("products.option")}</span><select value={selectedVariant?.id ?? ""} onChange={(event) => setSelectedVariant(activeVariants.find((item) => item.id === Number(event.target.value)) ?? null)}><option value="">{t("products.chooseOption")}</option>{activeVariants.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label> : null}<div className="detail-actions"><div className="quantity-row"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>-</button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity((value) => Math.min(availableQuantity, value + 1))}>+</button></div><Button type="button" disabled={soldOut || (activeVariants.length > 0 && !selectedVariant)} onClick={() => onAddToCart(product, quantity, variant)}>{t("common.addToCart")}</Button></div></div></section></main>;
}
