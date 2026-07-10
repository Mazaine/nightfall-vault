import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getProducts } from "../../api/products";
import { SiteHeader } from "../../components/SiteHeader";
import { Input, LoadingState, PageHeader } from "../../components/ui";
import { ProductGrid } from "../../components/ui/ProductGrid";
import { useI18n } from "../../i18n";
import type { AddToCartHandler, Product } from "../../types";
import "./CategoryPage.css";

type CategoryPageProps = { cartCount: number; onAddToCart: AddToCartHandler };

export function CategoryPage({ cartCount, onAddToCart }: CategoryPageProps) {
  const { t } = useI18n();
  const { categorySlug, subcategorySlug } = useParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    getProducts({ search: searchTerm || undefined, category_slug: categorySlug, subcategory_slug: subcategorySlug })
      .then(setProducts).catch(() => setProducts([])).finally(() => setIsLoading(false));
  }, [categorySlug, searchTerm, subcategorySlug]);

  return <main className="app-shell"><SiteHeader cartCount={cartCount} /><section className="page-content"><PageHeader eyebrow={t("products.category")} title={categorySlug ? t("products.title") : t("products.title")} lead={t("products.lead")} /><div className="catalog-toolbar"><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t("products.searchPlaceholder")} /></div>{isLoading ? <LoadingState text={t("states.loadingProducts")} /> : <ProductGrid products={products} onAddToCart={onAddToCart} />}</section></main>;
}
