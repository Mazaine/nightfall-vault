import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getActiveCategories } from "../api/categories";
import { getFeaturedProducts } from "../api/products";
import { SiteHeader } from "../components/SiteHeader";
import { ProductGrid } from "../components/ui/ProductGrid";
import { Button, Card, EmptyState, LoadingState, PageHeader } from "../components/ui";
import { useI18n } from "../i18n";
import type { AddToCartHandler, Category, Product } from "../types";
import "./HomePage.css";

type HomePageProps = { cartCount: number; onAddToCart: AddToCartHandler };

export function HomePage({ cartCount, onAddToCart }: HomePageProps) {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getFeaturedProducts(), getActiveCategories()])
      .then(([featuredProducts, activeCategories]) => { setProducts(featuredProducts); setCategories(activeCategories); })
      .catch(() => { setProducts([]); setCategories([]); })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="home-hero">
        <div className="home-hero-inner">
          <PageHeader eyebrow={t("home.eyebrow")} title={t("home.title")} lead={t("home.lead")} actions={<><Link className="primary-action" to="/products">{t("home.primaryCta")}</Link><Link className="secondary-action" to="/admin">{t("home.secondaryCta")}</Link></>} />
          <Card className="hero-panel"><span>React</span><span>FastAPI</span><span>PostgreSQL</span><span>Redis</span></Card>
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading"><div><p className="eyebrow">{t("home.featured")}</p><h2>{t("home.featured")}</h2></div><Link className="back-link" to="/products">{t("common.open")}</Link></div>
        {isLoading ? <LoadingState text={t("states.loadingProducts")} /> : <ProductGrid products={products} onAddToCart={onAddToCart} />}
      </section>

      <section className="page-section category-showcase">
        <div className="section-heading"><div><p className="eyebrow">{t("home.categories")}</p><h2>{t("home.categories")}</h2></div></div>
        <div className="category-grid">{categories.length === 0 ? <EmptyState title={t("common.empty")} /> : categories.slice(0, 6).map((category) => <Card className="category-tile" key={category.id}><span>{category.sort_order + 1}</span><h3>{category.name}</h3><p>{category.description ?? t("products.category")}</p><Link to={`/category/${category.slug}`}>{t("common.open")}</Link></Card>)}</div>
      </section>

      <section className="page-section info-grid-section">
        <Card className="info-card"><h2>{t("home.benefits")}</h2><ul><li>{t("home.benefit1")}</li><li>{t("home.benefit2")}</li><li>{t("home.benefit3")}</li></ul></Card>
        <Card className="info-card"><h2>{t("home.howItWorks")}</h2><ol><li>{t("home.step1")}</li><li>{t("home.step2")}</li><li>{t("home.step3")}</li></ol></Card>
      </section>

      <section className="page-section newsletter-band">
        <div><p className="eyebrow">{t("home.newsletter")}</p><h2>{t("home.newsletter")}</h2><p>{t("home.newsletterLead")}</p></div>
        <form><input placeholder={t("common.email")} /><Button type="button">{t("home.subscribe")}</Button></form>
      </section>
    </main>
  );
}
