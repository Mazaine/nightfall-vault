import { FormEvent, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../i18n";
import "./SiteHeader.css";

type SiteHeaderProps = { cartCount: number };

export function SiteHeader({ cartCount }: SiteHeaderProps) {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();
    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      setIsMenuOpen(false);
    }
  }

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to="/" aria-label={t("brand.name")} onClick={closeMenu}>
          <span className="brand-mark">WT</span>
          <span><strong>{t("brand.name")}</strong><small>{t("brand.tagline")}</small></span>
        </Link>

        <button className="menu-toggle" type="button" onClick={() => setIsMenuOpen((value) => !value)} aria-expanded={isMenuOpen}>
          <span /> <span /> <span />
        </button>

        <div className={`site-header-panel ${isMenuOpen ? "open" : ""}`}>
          <nav className="site-nav" aria-label="Main navigation">
            <NavLink to="/" onClick={closeMenu}>{t("nav.home")}</NavLink>
            <NavLink to="/products" onClick={closeMenu}>{t("nav.products")}</NavLink>
            <NavLink to="/categories" onClick={closeMenu}>{t("nav.categories")}</NavLink>
            <NavLink to="/my-orders" onClick={closeMenu}>{t("nav.orders")}</NavLink>
            {user?.role === "admin" ? <NavLink to="/admin" onClick={closeMenu}>{t("nav.admin")}</NavLink> : null}
          </nav>

          <form className="site-search" onSubmit={handleSearch}>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t("products.searchPlaceholder")} />
            <button type="submit">{t("nav.search")}</button>
          </form>

          <div className="header-actions">
            <div className="language-switch" aria-label={t("language.label")}>
              <button type="button" className={language === "hu" ? "active" : ""} onClick={() => setLanguage("hu")}>{t("language.hu")}</button>
              <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>{t("language.en")}</button>
            </div>
            <Link className="cart-link" to="/cart" onClick={closeMenu}>{t("nav.cart")} <span>{cartCount}</span></Link>
            {user ? <button className="logout-button" type="button" onClick={() => { logout(); closeMenu(); }}>{t("nav.logout")}</button> : <Link className="login-link" to="/auth" onClick={closeMenu}>{t("nav.login")}</Link>}
          </div>
        </div>
      </div>
    </header>
  );
}
