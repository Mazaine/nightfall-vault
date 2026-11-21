import { NavLink, useLocation } from "react-router";
import "../pages/SellerInventoryPage.css";
export function SellingNavigation() {
  const location = useLocation();
  const auction = new URLSearchParams(location.search).get("type") === "auction";
  return <nav className="selling-navigation" aria-label="Hirdetésfeladás"><NavLink to="/auctions/create?type=fixed" className={({ isActive }) => isActive && !auction ? "is-active" : ""}><span className="selling-long">Fix áras eladás</span><span className="selling-short">Fix áras</span></NavLink><NavLink to="/auctions/create?type=auction" className={({ isActive }) => isActive && auction ? "is-active" : ""}>Aukció</NavLink><NavLink to="/inventory" className={({ isActive }) => isActive ? "is-active" : ""}><span className="selling-long">Készletkezelő</span><span className="selling-short">Készlet</span></NavLink></nav>;
}
