import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getActiveCategories } from "../api/categories";
import { SiteHeader } from "../components/SiteHeader";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useI18n } from "../i18n";
import type { Category } from "../types";
import "./CategoriesPage.css";

type CategoriesPageProps = { cartCount: number };

export function CategoriesPage({ cartCount }: CategoriesPageProps) {
  const { t } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getActiveCategories().then(setCategories).catch(() => setError(true)).finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="page-content categories-page">
        <PageHeader eyebrow={t("nav.categories")} title={t("home.categories")} lead={t("products.categoriesLead")} />
        {isLoading ? <LoadingState text={t("common.loading")} /> : null}
        {error ? <ErrorState title={t("common.error")} /> : null}
        {!isLoading && !error && categories.length === 0 ? <EmptyState title={t("common.empty")} /> : null}
        <div className="category-overview-grid">
          {categories.map((category) => (
            <Card className="category-overview-card" key={category.id}>
              <span>{category.sort_order.toString().padStart(2, "0")}</span>
              <h2>{category.name}</h2>
              {category.description ? <p>{category.description}</p> : null}
              <Link to={`/category/${category.slug}`}>{t("common.open")}</Link>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
