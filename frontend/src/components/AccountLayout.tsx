import { NavLink, Outlet } from "react-router-dom";

const accountItems = [
  { to: "/account/transactions", label: "Tranzakcióim" },
  { to: "/account/messages", label: "Üzeneteim" },
  { to: "/account/profile", label: "Profilbeállítások" },
  { to: "/account/bids", label: "Licitjeim" },
  { to: "/account/auctions", label: "Saját aukcióim" },
  { to: "/account/vip", label: "VIP tagság" },
  { to: "/account/notifications", label: "Értesítések" },
  { to: "/account/saved-searches", label: "Mentett keresések" },
  { to: "/account/watchlist", label: "Figyelőlista" },
  { to: "/account/reports", label: "Jelentéseim" },
  { to: "/account/blocked-users", label: "Blokkolt felhasználók" },
];

export function AccountLayout() {
  return (
    <section className="container page-shell account-shell">
      <a className="skip-link account-skip-link" href="#account-content">Ugrás a fióktartalomhoz</a>
      <aside className="account-sidebar" aria-label="Fióknavigáció">
        <p className="eyebrow">Saját fiók</p>
        <nav className="account-nav">
          {accountItems.map((item) => (
            <NavLink to={item.to} key={item.to}>{item.label}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="account-content" id="account-content" tabIndex={-1}>
        <Outlet />
      </div>
    </section>
  );
}
