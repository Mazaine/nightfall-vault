import { NavLink, useLocation } from "react-router";
import { useAuth } from "../AuthContext";

const items = [
  { label: "Főoldal", to: "/", icon: "⌂" },
  { label: "Aukciók", to: "/auctions", icon: "◇" },
  { label: "Indítás", to: "/auctions/create", icon: "+", primary: true },
  { label: "Licitjeim", to: "/my-bids", icon: "↗" },
  { label: "Fiók", to: "/account/profile", icon: "○" },
];

export function MobileBottomNav() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return null;
  return <nav className="mobile-bottom-nav" aria-label="Mobil gyorsnavigáció">{items.map((item) => {
    const isCreate = item.primary && location.pathname === "/auctions/create";
    return <NavLink key={item.to} to={item.to} className={({ isActive }) => `${item.primary ? "is-primary " : ""}${(item.primary ? isCreate : isActive) ? "is-active" : ""}`.trim()}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></NavLink>;
  })}</nav>;
}
