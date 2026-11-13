import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { Auction } from "../../api/auctions";
import { HomeVipShowcase } from "./HomeVipShowcase";

export function HomeHero({ featured = [] }: { featured?: Auction[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function searchCards(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({ tab: "cards" });
    if (query.trim()) params.set("q", query.trim());
    navigate(`/marketplace?${params.toString()}`);
  }

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
          <form className="home-hero-search" role="search" onSubmit={searchCards}>
            <label className="home-search-label" htmlFor="home-card-search">Keress a kártyák között</label>
            <div className="home-search-control">
              <input id="home-card-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lap neve vagy kiadása…" maxLength={180} />
              <button className="button button-primary" type="submit">Keresés</button>
            </div>
          </form>
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
