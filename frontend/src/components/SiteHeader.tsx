import { KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useAuth } from "../AuthContext";
import { getUnreadNotificationCount } from "../api/auctions";
import { useNotifications } from "../NotificationContext";
import { UNREAD_NOTIFICATION_COUNT_CHANGED } from "../utils/notificationEvents";
import { CART_CHANGED_EVENT, getCart } from "../api/cart";

const navItems: { label: string; to: string; authenticated?: boolean; primary?: boolean; emphasis?: boolean }[] = [
  { label: "Kezdőlap", to: "/" },
  { label: "Piactér", to: "/marketplace" },
  { label: "Cseremappák", to: "/vault/community" },
  { label: "Virtuális mappám", to: "/vault", authenticated: true, emphasis: true },
  { label: "Hirdetés feladása", to: "/auctions/create", authenticated: true, primary: true },
  { label: "Saját ügyleteim", to: "/account/transactions", authenticated: true },
  { label: "Szabályok", to: "/how-it-works" },
];

const accountItems = [
  ["Virtuális mappám", "/vault"],
  ["Licitjeim", "/my-bids"],
  ["Saját hirdetéseim", "/account/auctions"],
  ["Vásárlásaim és eladásaim", "/account/transactions"],
  ["Profilbeállítások", "/account/profile"],
  ["Értesítések", "/account/notifications"],
  ["Jelentéseim", "/account/reports"],
  ["Blokkolt felhasználók", "/account/blocked-users"],
] as const;

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const { unreadCount, isRealtimeReady } = useNotifications();
  const [displayUnreadCount, setDisplayUnreadCount] = useState(unreadCount);
  const [cartCount, setCartCount] = useState(0);
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const accountMenuId = useId();
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const primaryNavRef = useRef<HTMLElement>(null);
  const userName = user?.full_name || user?.username || user?.email || "";

  useEffect(() => {
    setIsMenuOpen(false);
    setIsAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => { setDisplayUnreadCount(unreadCount); }, [unreadCount]);

  useEffect(() => {
    if (!isAuthenticated) { setCartCount(0); return; }
    let active = true;
    getCart().then((cart) => { if (active) setCartCount(cart.item_count); }).catch(() => undefined);
    return () => { active = false; };
  }, [isAuthenticated]);

  useEffect(() => {
    const update = (event: Event) => {
      const count = (event as CustomEvent<number | undefined>).detail;
      if (typeof count === "number") setCartCount(count);
      else if (isAuthenticated) getCart().then((cart) => setCartCount(cart.item_count)).catch(() => undefined);
    };
    window.addEventListener(CART_CHANGED_EVENT, update);
    return () => window.removeEventListener(CART_CHANGED_EVENT, update);
  }, [isAuthenticated]);

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
    else if (isMenuOpen) primaryNavRef.current?.querySelector<HTMLElement>("a")?.focus();
  }, [isAccountOpen, isMenuOpen]);

  const closeMobileMenu = () => {
    setIsMenuOpen(false);
    window.requestAnimationFrame(() => mobileButtonRef.current?.focus());
  };

  const handleAccountMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(accountMenuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "Tab") setIsAccountOpen(false);
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex].focus();
  };

  const signOut = () => { setIsAccountOpen(false); logout(); navigate("/"); };

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to={isAdmin ? "/admin" : "/"} aria-label={isAdmin ? "Adminfelület" : "Nightfall Vault kezdőlap"}>
          <img className="brand-logo" src="/assets/nightfall-vault-logo-transparent.png" alt="Nightfall Vault" width="2172" height="724" decoding="async" fetchPriority="high" />
        </Link>

        <button ref={mobileButtonRef} className="menu-toggle" type="button" aria-label={isMenuOpen ? "Menü bezárása" : "Menü megnyitása"} aria-expanded={isMenuOpen} aria-controls="primary-navigation" onClick={() => setIsMenuOpen((value) => !value)}>
          <span /><span /><span />
        </button>

        {isMenuOpen ? <div className="menu-backdrop" aria-hidden="true" onClick={closeMobileMenu} /> : null}

        <nav ref={primaryNavRef} className={isMenuOpen ? "site-nav is-open" : "site-nav"} id="primary-navigation" aria-label="Elsődleges navigáció">
          {navItems.filter((item) => !item.authenticated || isAuthenticated).map((item) => <NavLink className={[item.primary ? "nav-primary-action" : "", item.emphasis ? "nav-vault-link" : ""].filter(Boolean).join(" ") || undefined} to={item.to} key={item.to} end={item.to === "/"}>{item.label}</NavLink>)}
          {!isAuthenticated ? <div className="mobile-auth-links"><NavLink to="/login">Belépés</NavLink><NavLink to="/register">Regisztráció</NavLink></div> : null}
        </nav>

        <div className="header-actions" aria-label="Fiókműveletek">
          <Link className="icon-button icon-button-search" to="/marketplace" aria-label="Keresés a piactéren" />
          {isAuthenticated ? <Link className="cart-link icon-button" to="/cart" aria-label={`Kosár${cartCount ? `, ${cartCount} tétel` : ""}`}><svg className="cart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 9.5h17l-1.6 9H5.1l-1.6-9Z"/><path d="m8 9.5 4-5 4 5M8.5 13v2.5m3.5-2.5v2.5m3.5-2.5v2.5"/></svg>{cartCount > 0 ? <strong>{cartCount > 99 ? "99+" : cartCount}</strong> : null}</Link> : null}
          {isAuthenticated ? <Link className="notification-link icon-button" to="/account/notifications" aria-label={`Értesítések${displayUnreadCount ? `, ${displayUnreadCount} olvasatlan` : ""}`}><span className="visually-hidden">Értesítések</span>{displayUnreadCount > 0 ? <strong>{displayUnreadCount > 99 ? "99+" : displayUnreadCount}</strong> : null}</Link> : null}
          {isAuthenticated ? (
            <div className="account-menu-wrap">
              <button ref={accountButtonRef} className="account-menu-trigger" type="button" aria-label="Felhasználói menü" aria-haspopup="menu" aria-expanded={isAccountOpen} aria-controls={accountMenuId} onClick={() => setIsAccountOpen((value) => !value)}>
                <span className="icon-button icon-button-profile" aria-hidden="true" />
                <span className="account-user-name">{userName}</span>
              </button>
              {isAccountOpen ? <div ref={accountMenuRef} className="account-menu" id={accountMenuId} role="menu" aria-label="Felhasználói menü" onKeyDown={handleAccountMenuKeyDown}>{accountItems.map(([label, to]) => <Link role="menuitem" tabIndex={-1} to={to} key={to}>{label}</Link>)}{isAdmin ? <Link role="menuitem" tabIndex={-1} to="/admin">Adminfelület</Link> : null}<button role="menuitem" tabIndex={-1} type="button" onClick={signOut}>Kijelentkezés</button></div> : null}
            </div>
          ) : <><Link className="button button-ghost login-button" to="/login">Belépés</Link><Link className="button button-primary register-button" to="/register">Regisztráció</Link></>}
        </div>
      </div>
    </header>
  );
}
