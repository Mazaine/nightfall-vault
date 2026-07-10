import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getProducts } from "../../api/products";
import { SiteHeader } from "../../components/SiteHeader";
import { LoadingState, PageHeader } from "../../components/ui";
import { ProductGrid } from "../../components/ui/ProductGrid";
import { useI18n } from "../../i18n";
import type { AddToCartHandler, Product } from "../../types";
import "./SearchPage.css";

type SearchPageProps = { cartCount: number; onAddToCart: AddToCartHandler };

export function SearchPage({ cartCount, onAddToCart }: SearchPageProps) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { setIsLoading(true); getProducts({ search: query || undefined }).then(setProducts).catch(() => setProducts([])).finally(() => setIsLoading(false)); }, [query]);

  return <main className="app-shell"><SiteHeader cartCount={cartCount} /><section className="page-content"><PageHeader eyebrow={t("nav.search")} title={t("products.title")} lead={query} />{isLoading ? <LoadingState text={t("states.loadingProducts")} /> : <ProductGrid products={products} onAddToCart={onAddToCart} />}</section></main>;
}
