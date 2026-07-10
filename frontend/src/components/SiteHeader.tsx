import { Link, NavLink } from "react-router-dom";

const navItems = [
  { label: "Kezdőlap", to: "/" },
  { label: "Termékek", to: "/products" },
  { label: "Aukciók", to: "/auctions" },
  { label: "Kategóriák", to: "/categories" },
  { label: "Hogyan működik?", to: "/how-it-works" },
  { label: "Rólunk", to: "/about" },
  { label: "Kapcsolat", to: "/contact" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to="/" aria-label="Nightfall Vault kezdőlap">
          <img
            className="brand-logo"
            src="/assets/nightfall-vault-logo-transparent.png"
            alt="Nightfall Vault Auction House"
          />
        </Link>

        <nav className="site-nav" aria-label="Elsődleges navigáció">
          {navItems.map((item) => (
            <NavLink to={item.to} key={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions" aria-label="Fiók műveletek">
          <button className="icon-button" type="button" aria-label="Keresés" />
          <Link className="icon-button icon-button-bag" to="/cart" aria-label="Kosár" />
          <Link className="button button-ghost login-button" to="/login">Belépés</Link>
          <Link className="button button-primary register-button" to="/register">Regisztráció</Link>
        </div>
      </div>
    </header>
  );
}
