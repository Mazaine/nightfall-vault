import { Link } from "react-router-dom";
import { categories } from "../../data/content";

export function HomeCategories() {
  return (
    <section className="container category-strip" aria-label="Aukciós kategóriák">
      {categories.map((category) => (
        <Link className="category-button" to="/categories" key={category}>
          <span aria-hidden="true" />
          {category}
        </Link>
      ))}
    </section>
  );
}
