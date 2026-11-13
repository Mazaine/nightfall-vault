import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { getHomeAuctionOverview, type HomeAuctionOverview, type AuctionRealtimeSnapshot } from "../api/auctions";
import { HomeHero } from "./home/HomeHero";
import { HomeDashboard } from "./home/HomeDashboard";
import { HomeLiveBids } from "./home/HomeLiveBids";
import { HomeCardGrid, HomeSealedProducts } from "./home/HomeProductSections";
import "./home/HomeLanding.css";

function updateSnapshot(overview: HomeAuctionOverview, snapshot: AuctionRealtimeSnapshot): HomeAuctionOverview {
  const update = (items: HomeAuctionOverview["featured"]) => items.map((auction) => auction.id === snapshot.auction_id ? { ...auction, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count } : auction);
  return { ...overview, featured: update(overview.featured), soon_ending: update(overview.soon_ending), new_auctions: update(overview.new_auctions), random_cards: update(overview.random_cards ?? []), random_boosters: update(overview.random_boosters ?? []) };
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
          random_boosters: includeRandom ? (next.random_boosters ?? []) : (current?.random_boosters ?? []),
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
      <HomeHero featured={overview?.featured ?? []} />
      {error && !overview ? <div className="container"><p role="alert">{error} <button className="button button-secondary" type="button" onClick={() => void refresh()}>Újrapróbálás</button></p></div> : null}
      <HomeLiveBids auctions={overview?.soon_ending ?? []} />
      <HomeCardGrid auctions={overview?.random_cards ?? []} total={overview?.cards_total ?? 0} isLoading={!overview && !error} />
      <HomeSealedProducts auctions={overview?.random_boosters ?? []} total={overview?.boosters_total ?? 0} />
      {user ? <HomeDashboard overview={overview} /> : null}
    </>
  );
}
