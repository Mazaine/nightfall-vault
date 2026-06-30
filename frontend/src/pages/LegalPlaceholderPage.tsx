import { SiteHeader } from "../components/SiteHeader";
import "./LegalPlaceholderPage.css";

type LegalPlaceholderPageProps = {
  cartCount: number;
  title: string;
};

export function LegalPlaceholderPage({ cartCount, title }: LegalPlaceholderPageProps) {
  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="legal-placeholder-page page-content">
        <p className="eyebrow">Dokumentum</p>
        <h1>{title}</h1>
        <p className="lead">
          Ez az oldal elő van készítve. A végleges jogi szöveget később külön tartalomként
          töltjük fel.
        </p>
      </section>
    </main>
  );
}
