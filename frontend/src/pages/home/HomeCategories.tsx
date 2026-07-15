import { Link } from "react-router-dom";
import { categories } from "../../data/content";

export function HomeCategories() {
  return (
    <section className="container category-strip" aria-label="Aukciós kategóriák">
      {categories.map((category) => (
        <Link className="category-button" to={`/auctions?category=${encodeURIComponent(category)}`} key={category}>
          <span aria-hidden="true" />
          {category}
        </Link>
      ))}
    </section>
  );
}
