import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { getHomeAuctionOverview, type HomeAuctionOverview, type AuctionRealtimeSnapshot } from "../api/auctions";
import { HomeFeatured } from "./home/HomeFeatured";
import { HomeHero } from "./home/HomeHero";
import { HomeDashboard } from "./home/HomeDashboard";
import { HomeAuctionSection } from "./home/HomeAuctionSection";
import { HomeAuctionCarousel } from "./home/HomeAuctionCarousel";
import { HomeQuickLinks } from "./home/HomeQuickLinks";
import "./home/HomeLanding.css";

function updateSnapshot(overview: HomeAuctionOverview, snapshot: AuctionRealtimeSnapshot): HomeAuctionOverview {
  const update = (items: HomeAuctionOverview["featured"]) => items.map((auction) => auction.id === snapshot.auction_id ? { ...auction, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count } : auction);
  return { ...overview, featured: update(overview.featured), soon_ending: update(overview.soon_ending), new_auctions: update(overview.new_auctions), random_cards: update(overview.random_cards ?? []) };
}

export function HomePage() {
  const { isLoading, user } = useAuth();
  const { subscribe } = useAuctionRealtime();
  const [overview, setOverview] = useState<HomeAuctionOverview | null>(null);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const randomSampleLoaded = useRef(false);
  const refresh = useCallback(async (resampleCards = false) => {
    const number = ++requestNumber.current;
    try {
      // Background updates keep the initial draw; a new page/auth session draws again.
      const includeRandom = resampleCards || !randomSampleLoaded.current;
      const next = await getHomeAuctionOverview(includeRandom);
      if (number === requestNumber.current) {
        setOverview((current) => ({
          ...next,
          random_cards: includeRandom ? (next.random_cards ?? []) : (current?.random_cards ?? []),
        }));
        if (includeRandom) randomSampleLoaded.current = true;
        setError("");
      }
    } catch (failure) {
      if (number === requestNumber.current) setError(failure instanceof Error ? failure.message : "A kezdőlap adatai nem érhetők el.");
    }
  }, []);
  useEffect(() => {
    if (isLoading) return;
    randomSampleLoaded.current = false;
    setOverview(null);
    void refresh(true);
    return () => { requestNumber.current += 1; };
  }, [isLoading, user?.id, refresh]);
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = subscribe((snapshot) => {
      setOverview((current) => current ? updateSnapshot(current, snapshot) : current);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (!document.hidden) void refresh(false); }, 500);
    });
    const visible = () => { if (!document.hidden) void refresh(false); };
    document.addEventListener("visibilitychange", visible);
    return () => { unsubscribe(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh, subscribe]);
  return (
    <>
      <HomeHero />
      <HomeQuickLinks />
      <HomeDashboard overview={overview} />
      {error && !overview ? <div className="container"><p role="alert">{error} <button className="button button-secondary" type="button" onClick={() => void refresh()}>Újrapróbálás</button></p></div> : null}
      <HomeAuctionCarousel
        title="Fedezz fel lapokat"
        autoAdvance={false}
        auctions={overview?.random_cards ?? []}
        sectionClassName="home-discovery-section home-random-cards"
        browsePath="/marketplace?tab=cards"
        browseLabel="Összes lap"
        isLoading={!overview && !error}
        emptyTitle="Jelenleg nincs elérhető fix áras HKK-lap. Nézz körül a Piactéren!"
      />
      <HomeFeatured auctions={overview?.featured ?? []} isLoading={!overview && !error} />
      <HomeAuctionSection title="Hamarosan lejár" auctions={overview?.soon_ending ?? []} />
    </>
  );
}
