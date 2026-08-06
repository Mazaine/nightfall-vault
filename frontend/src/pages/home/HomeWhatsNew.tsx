import { Link } from "react-router";
import { latestUpdate } from "../../content/whatsNew";

export function HomeWhatsNew() {
  return <section className="container home-update" aria-labelledby="latest-update-title">
    <div className="side-panel home-update-card">
      <div><p className="eyebrow">{latestUpdate.version}</p><h2 id="latest-update-title">{latestUpdate.title}</h2><p>{latestUpdate.summary}</p></div>
      <ul>{latestUpdate.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
      <Link className="button button-secondary" to={latestUpdate.target}>Részletek a Hogyan működik? oldalon</Link>
    </div>
  </section>;
}
