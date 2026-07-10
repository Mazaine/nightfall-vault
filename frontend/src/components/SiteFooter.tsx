import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link className="footer-brand" to="/" aria-label="Nightfall Vault kezdőlap">
          <img
            className="footer-logo"
            src="/assets/nightfall-vault-logo-transparent.png"
            alt="Nightfall Vault Auction House"
          />
        </Link>

        <nav aria-label="Jogi és információs linkek">
          <Link to="/account">Fiók</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/terms">Felhasználási feltételek</Link>
          <Link to="/privacy">Adatvédelem</Link>
          <Link to="/support">Támogatás</Link>
        </nav>
      </div>
    </footer>
  );
}
