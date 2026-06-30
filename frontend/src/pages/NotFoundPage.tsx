import { Link } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { EmptyState } from "../components/ui";
import { useI18n } from "../i18n";
import "./NotFoundPage.css";

type NotFoundPageProps = { cartCount: number };

export function NotFoundPage({ cartCount }: NotFoundPageProps) {
  const { t } = useI18n();
  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="not-found-page page-content">
        <EmptyState title={t("states.notFoundTitle")} text={t("states.notFoundLead")} />
        <Link className="primary-action" to="/">{t("nav.home")}</Link>
      </section>
    </main>
  );
}
