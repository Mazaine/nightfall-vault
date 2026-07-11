import { Link, NavLink } from "react-router-dom";

const navItems = [
  { label: "Kezdőlap", to: "/" },
  { label: "Licitjeim", to: "/account" },
  { label: "Aukciók", to: "/auctions" },
  { label: "Kategóriák", to: "/categories" },
  { label: "Hogyan működik?", to: "/how-it-works" },
  { label: "Rólunk", to: "/about" },
  { label: "Kapcsolat", to: "/contact" },
];

type StoredUser = {
  name?: string;
  fullName?: string;
  email?: string;
  role?: string;
  isAdmin?: boolean;
};

function getStoredUser() {
  if (typeof window === "undefined") {
    return { name: "", isAdmin: false };
  }

  const rawUser = window.localStorage.getItem("nightfall_user");
  if (!rawUser) {
    return { name: "", isAdmin: false };
  }

  try {
    const user = JSON.parse(rawUser) as StoredUser;
    return {
      name: user.name || user.fullName || user.email || "",
      isAdmin: user.role === "admin" || user.isAdmin === true,
    };
  } catch {
    return { name: "", isAdmin: false };
  }
}

export function SiteHeader() {
  const user = getStoredUser();
  const brandTarget = user.isAdmin ? "/admin" : "/";

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" to={brandTarget} aria-label={user.isAdmin ? "Admin felület" : "Nightfall Vault kezdőlap"}>
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
          <button className="icon-button icon-button-search" type="button" aria-label="Keresés" />
          <Link className="icon-button icon-button-profile" to="/account" aria-label="Profil" />
          {user.name ? (
            <Link className="button button-ghost user-button" to="/account">{user.name}</Link>
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
