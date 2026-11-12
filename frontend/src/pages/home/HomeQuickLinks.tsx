import { Link } from "react-router";

const destinations = [
  { to: "/marketplace?tab=cards", icon: "▤", title: "Lapok", description: "Készletes ajánlatok" },
  { to: "/marketplace?tab=auctions", icon: "⚔", title: "Aukciók", description: "Licitálj kincsekre" },
  { to: "/vault/community", icon: "⇄", title: "Csere", description: "Gyűjtők lapjai" },
  { to: "/vault", icon: "♜", title: "Virtuális mappa", description: "Rendezd a lapjaidat" },
];

export function HomeQuickLinks() {
  return (
    <nav className="container home-quick-links" aria-label="Főoldali gyors elérés">
      {destinations.map((destination) => (
        <Link key={destination.to} className="home-quick-tile" to={destination.to}>
          <span className="home-quick-icon" aria-hidden="true">{destination.icon}</span>
          <span className="home-quick-copy"><strong>{destination.title}</strong><small>{destination.description}</small></span>
          <span className="home-quick-arrow" aria-hidden="true">›</span>
        </Link>
      ))}
    </nav>
  );
}
