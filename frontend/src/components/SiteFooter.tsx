import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import "./SiteFooter.css";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand"><span className="brand-mark">WT</span><div><strong>{t("brand.name")}</strong><p>{t("footer.text")}</p></div></div>
        <nav aria-label={t("footer.legal")}>
          <Link to="/terms">{t("footer.terms")}</Link>
          <Link to="/privacy">{t("footer.privacy")}</Link>
          <Link to="/shipping-info">{t("footer.shipping")}</Link>
          <Link to="/payment-info">{t("footer.payment")}</Link>
        </nav>
      </div>
    </footer>
  );
}
