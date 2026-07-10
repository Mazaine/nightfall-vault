import type { AddToCartHandler, Product } from "../../types";
import { EmptyState } from "./index";
import { ProductCard } from "../ProductCard";
import { useI18n } from "../../i18n";

export function ProductGrid({ products, onAddToCart }: { products: Product[]; onAddToCart?: AddToCartHandler }) {
  const { t } = useI18n();
  if (products.length === 0) {
    return <EmptyState title={t("products.noProducts")} />;
  }
  return <div className="product-grid">{products.map((product) => <ProductCard product={product} onAddToCart={onAddToCart} key={product.id} />)}</div>;
}
