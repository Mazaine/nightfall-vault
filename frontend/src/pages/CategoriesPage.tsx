import { Link } from "react-router-dom";
import { categories } from "../data/content";

export function CategoriesPage() {
  return (
    <section className="container page-shell">
      <p className="eyebrow">Kategóriák</p>
      <h1>Aukciós kategóriák</h1>
      <div className="category-grid">
        {categories.map((category) => (
          <Link className="side-panel category-tile" to="/auctions" key={category}>
            <span className="ornament-icon" aria-hidden="true" />
            <h2>{category}</h2>
            <p>Kurált termékek, aktív licitek és gyorsan áttekinthető találatok.</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
