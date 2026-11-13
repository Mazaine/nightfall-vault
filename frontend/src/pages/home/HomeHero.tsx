import { Link } from "react-router";
import type { Auction } from "../../api/auctions";
import { HomeVipShowcase } from "./HomeVipShowcase";

export function HomeHero({ featured = [] }: { featured?: Auction[] }) {
  return (
    <section className="hero-section nv-home-hero" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true" />
      <div className="container hero-layout nv-hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">Nightfall Vault</p>
          <h1 id="hero-title"><span>A HKK-lapok</span><span>új otthona</span></h1>
          <p className="hero-lead">
            Fedezz fel különleges lapokat, licitálj, cserélj, vagy építsd fel saját gyűjteményed.
          </p>
          <div className="hero-actions" aria-label="Elsődleges műveletek">
            <Link className="button button-secondary" to="/marketplace?tab=cards">Lapok böngészése</Link>
            <Link className="button button-secondary" to="/vault">Virtuális mappám</Link>
          </div>
        </div>
        <div className="nv-hero-vip"><HomeVipShowcase auctions={featured} /></div>
      </div>
    </section>
  );
}
