import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../AuthContext";

const navItems = [
  { label: "Kezdőlap", to: "/" },
  { label: "Licitjeim", to: "/account" },
  { label: "Aukciók", to: "/auctions" },
  { label: "Kategóriák", to: "/categories" },
  { label: "Hogyan működik?", to: "/how-it-works" },
  { label: "Rólunk", to: "/about" },
  { label: "Kapcsolat", to: "/contact" },
];

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, isAdmin } = useAuth();
  const userName = user?.full_name || user?.username || user?.email || "";
  const brandTarget = isAdmin ? "/admin" : "/";
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to={brandTarget} aria-label={isAdmin ? "Admin felület" : "Nightfall Vault kezdőlap"}>
          <img
            className="brand-logo"
            src="/assets/nightfall-vault-logo-transparent.png"
            alt="Nightfall Vault Auction House"
          />
        </Link>

        <button
          className="menu-toggle"
          type="button"
          aria-label={isMenuOpen ? "Menü bezárása" : "Menü megnyitása"}
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsMenuOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          className={isMenuOpen ? "site-nav is-open" : "site-nav"}
          id="primary-navigation"
          aria-label="Elsődleges navigáció"
        >
          {navItems.map((item) => (
            <NavLink to={item.to} key={item.to} end={item.to === "/"} onClick={closeMenu}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions" aria-label="Fiók műveletek">
          <button className="icon-button icon-button-search" type="button" aria-label="Keresés" />
          <Link className="icon-button icon-button-profile" to="/account" aria-label="Profil" />
          {userName ? (
            <Link className="button button-ghost user-button" to="/account">{userName}</Link>
          ) : (
            <>
              <Link className="button button-ghost login-button" to="/login">Belépés</Link>
              <Link className="button button-primary register-button" to="/register">Regisztráció</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
