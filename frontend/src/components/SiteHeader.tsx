import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getUnreadNotificationCount } from "../api/auctions";
import { useAuth } from "../AuthContext";

const navItems = [
  { label: "Kezdolap", to: "/" },
  { label: "Licitjeim", to: "/account" },
  { label: "Aukciok", to: "/auctions" },
  { label: "Kategoriak", to: "/categories" },
  { label: "Hogyan mukodik?", to: "/how-it-works" },
  { label: "Rolunk", to: "/about" },
  { label: "Kapcsolat", to: "/contact" },
];

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, isAdmin, isAuthenticated } = useAuth();
  const userName = user?.full_name || user?.username || user?.email || "";
  const brandTarget = isAdmin ? "/admin" : "/";
  const closeMenu = () => setIsMenuOpen(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    getUnreadNotificationCount()
      .then((result) => setUnreadCount(result.unread_count))
      .catch(() => setUnreadCount(0));
  }, [isAuthenticated]);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to={brandTarget} aria-label={isAdmin ? "Admin felulet" : "Nightfall Vault kezdolap"}>
          <img className="brand-logo" src="/assets/nightfall-vault-logo-transparent.png" alt="Nightfall Vault Auction House" />
        </Link>

        <button
          className="menu-toggle"
          type="button"
          aria-label={isMenuOpen ? "Menu bezarasa" : "Menu megnyitasa"}
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsMenuOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={isMenuOpen ? "site-nav is-open" : "site-nav"} id="primary-navigation" aria-label="Elsodleges navigacio">
          {navItems.map((item) => (
            <NavLink to={item.to} key={item.to} end={item.to === "/"} onClick={closeMenu}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions" aria-label="Fiok muveletek">
          <button className="icon-button icon-button-search" type="button" aria-label="Kereses" />
          {isAuthenticated ? (
            <Link className="notification-link" to="/notifications" aria-label="Ertesitesek">
              <span>Ertesitesek</span>
              {unreadCount > 0 ? <strong>{unreadCount}</strong> : null}
            </Link>
          ) : null}
          {isAuthenticated ? <Link className="button button-ghost watchlist-button" to="/watchlist">Figyelolista</Link> : null}
          <Link className="icon-button icon-button-profile" to="/account" aria-label="Profil" />
          {userName ? (
            <Link className="button button-ghost user-button" to="/account">{userName}</Link>
          ) : (
            <>
              <Link className="button button-ghost login-button" to="/login">Belepes</Link>
              <Link className="button button-primary register-button" to="/register">Regisztracio</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
