import { useState } from "react";
import { Link } from "react-router-dom";
import type { AddToCartHandler, Product } from "../types";
import { useI18n } from "../i18n";
import { formatHuf } from "../utils/format";
import { getAvailableCartQuantity, isProductSoldOut } from "../utils/cart";
import { Badge, Button, Card } from "./ui";
import "./ProductCard.css";

type ProductCardProps = { product: Product; onAddToCart?: AddToCartHandler; compact?: boolean };

function getCardDescription(description: string | null) {
  return description ? description.replace(/\n/g, " ").replace(/\s+/g, " ").trim() : null;
}

export function ProductCard({ product, onAddToCart, compact = false }: ProductCardProps) {
  const { t } = useI18n();
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const isSoldOut = isProductSoldOut(product);
  const availableQuantity = getAvailableCartQuantity(product);
  const hasVariants = product.variants.some((variant) => variant.is_active);
  const canAddToCart = Boolean(onAddToCart) && !hasVariants && !isSoldOut;

  function handleAddToCart() {
    if (!onAddToCart || !canAddToCart) return;
    onAddToCart(product, selectedQuantity);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 900);
  }

  return (
    <Card className={`product-card ${compact ? "product-card-compact" : ""}`}>
      <Link className="product-media" to={`/products/${product.slug}`}>
        {product.is_featured ? <Badge tone="gold">{t("products.featured")}</Badge> : null}
        {isSoldOut ? <Badge tone="danger">{t("products.soldOut")}</Badge> : null}
        {product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" /> : <span className="media-mark">WT</span>}
      </Link>
      <div className="product-body">
        <div className="product-copy">
          <h3><Link to={`/products/${product.slug}`}>{product.name}</Link></h3>
          <p>{getCardDescription(product.short_description) ?? t("products.productDetails")}</p>
        </div>
        <div className="product-meta-row">
          <strong>{formatHuf(product.normal_price_huf)}</strong>
          <span>{product.manage_stock ? `${t("products.stock")}: ${product.stock_quantity}` : t("products.stock")}</span>
        </div>
        <div className="product-actions">
          {!canAddToCart ? <Link className="secondary-action" to={`/products/${product.slug}`}>{hasVariants ? t("products.chooseOption") : t("common.details")}</Link> : (
            <>
              <div className="mini-quantity-control" aria-label={t("common.quantity")}>
                <button type="button" disabled={selectedQuantity <= 1} onClick={() => setSelectedQuantity((value) => Math.max(1, value - 1))}>-</button>
                <strong>{selectedQuantity}</strong>
                <button type="button" disabled={selectedQuantity >= availableQuantity} onClick={() => setSelectedQuantity((value) => Math.min(availableQuantity, value + 1))}>+</button>
              </div>
              <Button type="button" onClick={handleAddToCart}>{justAdded ? t("cart.item") : t("common.addToCart")}</Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
