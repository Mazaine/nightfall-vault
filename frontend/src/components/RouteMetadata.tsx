import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type RouteMeta = {
  matches: (pathname: string) => boolean;
  title: string;
  description: string;
  indexable?: boolean;
};

const routeMeta: RouteMeta[] = [
  { matches: (path) => path === "/", title: "Prémium gyűjtői aukciók", description: "Fedezz fel ritka gyűjtői darabokat, licitálj átláthatóan, vagy indíts saját aukciót a Nightfall Vault közösségében." },
  { matches: (path) => path === "/auctions", title: "Aukciók", description: "Böngéssz a Nightfall Vault aktív gyűjtői aukciói között kategória, állapot és ár szerint." },
  { matches: (path) => /^\/auctions\/\d+$/.test(path), title: "Aukció részletei", description: "Tekintsd meg az aukció részleteit, képeit, licittörténetét és aktuális állapotát a Nightfall Vaultban." },
  { matches: (path) => path.startsWith("/users/"), title: "Felhasználói profil", description: "Nyilvános Nightfall Vault profil, aukciós előzmények és közösségi értékelések." },
  { matches: (path) => path === "/how-it-works", title: "Hogyan működik?", description: "Ismerd meg a Nightfall Vault licitálási, villámáras és ötpereces hosszabbítási szabályait." },
  { matches: (path) => path === "/about", title: "Rólunk", description: "Ismerd meg a Nightfall Vault világát és a biztonságos, közösségi aukciós tér alapelveit." },
  { matches: (path) => path === "/contact", title: "Kapcsolat", description: "Segítség és kapcsolatfelvételi lehetőségek a Nightfall Vault zárt béta felhasználóinak." },
  { matches: (path) => path === "/terms", title: "Felhasználási feltételek", description: "A Nightfall Vault zárt béta használatának legfontosabb szabályai és szolgáltatási határai." },
  { matches: (path) => path === "/privacy", title: "Adatvédelmi tájékoztató", description: "Áttekintés a Nightfall Vaultban kezelt adatokról, azok céljáról és a felhasználói lehetőségekről." },
  { matches: (path) => path === "/support", title: "Támogatás", description: "Gyors segítség fiókhoz, aukcióhoz, jelentéshez és biztonsági kérdésekhez." },
  { matches: (path) => path === "/login", title: "Belépés", description: "Belépés a Nightfall Vault fiókba.", indexable: false },
  { matches: (path) => path === "/register", title: "Regisztráció", description: "Nightfall Vault felhasználói fiók létrehozása.", indexable: false },
  { matches: (path) => path.startsWith("/forgot-password") || path.startsWith("/reset-password") || path.startsWith("/auth/"), title: "Fiók-helyreállítás", description: "Nightfall Vault fiók biztonságos helyreállítása.", indexable: false },
  { matches: (path) => path.startsWith("/account") || path.startsWith("/admin") || path.startsWith("/notifications") || path.startsWith("/watchlist") || path.startsWith("/saved-searches"), title: "Saját fiók", description: "Személyes Nightfall Vault fiókfelület.", indexable: false },
  { matches: (path) => path === "/categories", title: "Aukciók", description: "Böngéssz a Nightfall Vault aktív aukciói között.", indexable: false },
];

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const matched = routeMeta.find((entry) => entry.matches(pathname));
    const meta = matched ?? {
      title: "Az oldal nem található",
      description: "A keresett oldal nem található a Nightfall Vaultban.",
      indexable: false,
    };
    const publicOrigin = (import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || window.location.origin).replace(/\/+$/, "");
    const canonicalPath = pathname === "/categories" ? "/auctions" : pathname;
    const canonicalUrl = `${publicOrigin}${canonicalPath === "/" ? "/" : canonicalPath}`;
    const socialImageUrl = `${publicOrigin}/assets/nightfall-vault-logo.png`;
    const title = `${meta.title} | Nightfall Vault`;
    const robots = meta.indexable === false ? "noindex, nofollow" : "index, follow";

    document.title = title;
    upsertCanonical(canonicalUrl);
    upsertMeta('meta[name="description"]', { name: "description", content: meta.description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: robots });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: meta.description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: socialImageUrl });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: meta.description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: socialImageUrl });
  }, [pathname]);

  return null;
}
