import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getUnreadNotificationCount } from "../api/auctions";
import { useNotifications } from "../NotificationContext";
import { UNREAD_NOTIFICATION_COUNT_CHANGED } from "../utils/notificationEvents";

const navItems = [
  { label: "Kezdőlap", to: "/" },
  { label: "Licitjeim", to: "/account/bids", authenticated: true },
  { label: "Aukciók", to: "/auctions" },
  { label: "Hogyan működik?", to: "/how-it-works" },
  { label: "Rólunk", to: "/about" },
  { label: "Kapcsolat", to: "/contact" },
];

const accountItems = [
  ["Profilbeállítások", "/account/profile"],
  ["Licitjeim", "/account/bids"],
  ["Saját aukcióim", "/account/auctions"],
  ["Mentett keresések", "/account/saved-searches"],
  ["Figyelőlista", "/account/watchlist"],
  ["Értesítések", "/account/notifications"],
  ["Jelentéseim", "/account/reports"],
  ["Blokkolt felhasználók", "/account/blocked-users"],
] as const;

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const { unreadCount, isRealtimeReady } = useNotifications();
  const [displayUnreadCount, setDisplayUnreadCount] = useState(unreadCount);
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const accountMenuId = useId();
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const userName = user?.full_name || user?.username || user?.email || "";

  useEffect(() => {
    setIsMenuOpen(false);
    setIsAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => { setDisplayUnreadCount(unreadCount); }, [unreadCount]);

  useEffect(() => {
    if (!isAuthenticated || isRealtimeReady) return;
    let active = true;
    getUnreadNotificationCount().then((result) => { if (active) setDisplayUnreadCount(result.unread_count); }).catch(() => undefined);
    return () => { active = false; };
  }, [isAuthenticated, isRealtimeReady]);

  useEffect(() => {
    const update = (event: Event) => setDisplayUnreadCount(Math.max(0, (event as CustomEvent<number>).detail));
    window.addEventListener(UNREAD_NOTIFICATION_COUNT_CHANGED, update);
    return () => window.removeEventListener(UNREAD_NOTIFICATION_COUNT_CHANGED, update);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen && !isAccountOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isAccountOpen && !accountMenuRef.current?.contains(target) && !accountButtonRef.current?.contains(target)) setIsAccountOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isAccountOpen) { setIsAccountOpen(false); accountButtonRef.current?.focus(); }
      else if (isMenuOpen) { setIsMenuOpen(false); mobileButtonRef.current?.focus(); }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousedown", handlePointerDown); document.removeEventListener("keydown", handleKeyDown); };
  }, [isAccountOpen, isMenuOpen]);

  useEffect(() => {
    if (isAccountOpen) accountMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [isAccountOpen]);

  const signOut = () => { setIsAccountOpen(false); logout(); navigate("/"); };

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to={isAdmin ? "/admin" : "/"} aria-label={isAdmin ? "Adminfelület" : "Nightfall Vault kezdőlap"}>
          <img className="brand-logo" src="/assets/nightfall-vault-logo-transparent.png" alt="Nightfall Vault" />
        </Link>

        <button ref={mobileButtonRef} className="menu-toggle" type="button" aria-label={isMenuOpen ? "Menü bezárása" : "Menü megnyitása"} aria-expanded={isMenuOpen} aria-controls="primary-navigation" onClick={() => setIsMenuOpen((value) => !value)}>
          <span /><span /><span />
        </button>

        {isMenuOpen ? <button className="menu-backdrop" type="button" aria-label="Menü bezárása" onClick={() => setIsMenuOpen(false)} /> : null}

        <nav className={isMenuOpen ? "site-nav is-open" : "site-nav"} id="primary-navigation" aria-label="Elsődleges navigáció">
          {navItems.filter((item) => !item.authenticated || isAuthenticated).map((item) => <NavLink to={item.to} key={item.to} end={item.to === "/"}>{item.label}</NavLink>)}
          {!isAuthenticated ? <div className="mobile-auth-links"><NavLink to="/login">Belépés</NavLink><NavLink to="/register">Regisztráció</NavLink></div> : null}
        </nav>

        <div className="header-actions" aria-label="Fiókműveletek">
          <Link className="icon-button icon-button-search" to="/auctions" aria-label="Keresés az aukciók között" />
          {isAuthenticated ? <Link className="notification-link icon-button" to="/account/notifications" aria-label={`Értesítések${displayUnreadCount ? `, ${displayUnreadCount} olvasatlan` : ""}`}><span className="visually-hidden">Értesítések</span>{displayUnreadCount > 0 ? <strong>{displayUnreadCount > 99 ? "99+" : displayUnreadCount}</strong> : null}</Link> : null}
          {isAuthenticated ? (
            <div className="account-menu-wrap">
              <button ref={accountButtonRef} className="account-menu-trigger" type="button" aria-label="Felhasználói menü" aria-haspopup="menu" aria-expanded={isAccountOpen} aria-controls={accountMenuId} onClick={() => setIsAccountOpen((value) => !value)}>
                <span className="icon-button icon-button-profile" aria-hidden="true" />
                <span className="account-user-name">{userName}</span>
              </button>
              {isAccountOpen ? <div ref={accountMenuRef} className="account-menu" id={accountMenuId} role="menu" aria-label="Felhasználói menü">{accountItems.map(([label, to]) => <Link role="menuitem" tabIndex={-1} to={to} key={to}>{label}</Link>)}{isAdmin ? <Link role="menuitem" tabIndex={-1} to="/admin">Adminfelület</Link> : null}<button role="menuitem" tabIndex={-1} type="button" onClick={signOut}>Kijelentkezés</button></div> : null}
            </div>
          ) : <><Link className="button button-ghost login-button" to="/login">Belépés</Link><Link className="button button-primary register-button" to="/register">Regisztráció</Link></>}
        </div>
      </div>
    </header>
  );
}
