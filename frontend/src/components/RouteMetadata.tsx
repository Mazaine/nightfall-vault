import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const titles: Array<[string, string]> = [
  ["/account/transactions", "Tranzakcióim"],
  ["/admin/moderation", "Moderáció"],
  ["/account/messages", "Üzeneteim"],
  ["/account/profile", "Profilbeállítások"],
  ["/account/bids", "Licitjeim"],
  ["/account/auctions", "Saját aukcióim"],
  ["/account/notifications", "Értesítések"],
  ["/account/saved-searches", "Mentett keresések"],
  ["/account/watchlist", "Figyelőlista"],
  ["/account/reports", "Jelentéseim"],
  ["/account/blocked-users", "Blokkolt felhasználók"],
  ["/auctions", "Aukciók"],
  ["/categories", "Kategóriák"],
  ["/how-it-works", "Hogyan működik?"],
  ["/about", "Rólunk"],
  ["/contact", "Kapcsolat"],
  ["/login", "Belépés"],
  ["/register", "Regisztráció"],
  ["/forgot-password", "Elfelejtett jelszó"],
  ["/reset-password", "Új jelszó"],
  ["/auth/verify-email", "Fiókaktiválás"],
];

export function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = titles.find(([path]) => pathname === path || (path === "/auctions" && pathname.startsWith("/auctions/")));
    document.title = `${match?.[1] ?? "Nightfall Vault"} | Nightfall Vault`;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    const isPrivate = pathname.startsWith("/account") || pathname.startsWith("/admin") || ["/login", "/register", "/forgot-password", "/reset-password", "/auth/verify-email"].includes(pathname);
    robots.content = isPrivate ? "noindex, nofollow" : "index, follow";
  }, [pathname]);
  return null;
}
