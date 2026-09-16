import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { useAuctionRealtime } from "../AuctionRealtimeContext";
import { getHomeAuctionOverview, type HomeAuctionOverview, type AuctionRealtimeSnapshot } from "../api/auctions";
import { HomeFeatured } from "./home/HomeFeatured";
import { HomeHero } from "./home/HomeHero";
import { HomeDashboard } from "./home/HomeDashboard";
import { HomeAuctionSection } from "./home/HomeAuctionSection";

function updateSnapshot(overview: HomeAuctionOverview, snapshot: AuctionRealtimeSnapshot): HomeAuctionOverview {
  const update = (items: HomeAuctionOverview["featured"]) => items.map((auction) => auction.id === snapshot.auction_id ? { ...auction, status: snapshot.status, current_price: snapshot.current_price, highest_bid_id: snapshot.highest_bid_id, winner_id: snapshot.winner_id, ends_at: snapshot.ends_at, bid_count: snapshot.bid_count } : auction);
  return { ...overview, featured: update(overview.featured), soon_ending: update(overview.soon_ending), new_auctions: update(overview.new_auctions) };
}

export function HomePage() {
  const { isLoading, user } = useAuth();
  const { subscribe } = useAuctionRealtime();
  const [overview, setOverview] = useState<HomeAuctionOverview | null>(null);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const refresh = useCallback(async () => {
    const number = ++requestNumber.current;
    try {
      const next = await getHomeAuctionOverview();
      if (number === requestNumber.current) { setOverview(next); setError(""); }
    } catch (failure) {
      if (number === requestNumber.current) setError(failure instanceof Error ? failure.message : "A kezdőlap adatai nem érhetők el.");
    }
  }, []);
  useEffect(() => {
    if (isLoading) return;
    void refresh();
    return () => { requestNumber.current += 1; };
  }, [isLoading, user?.id, refresh]);
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = subscribe((snapshot) => {
      setOverview((current) => current ? updateSnapshot(current, snapshot) : current);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (!document.hidden) void refresh(); }, 500);
    });
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { unsubscribe(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh, subscribe]);
  return (
    <>
      <HomeHero />
      <HomeDashboard overview={overview} />
      {error && !overview ? <div className="container"><p role="alert">{error} <button className="button button-secondary" type="button" onClick={() => void refresh()}>Újrapróbálás</button></p></div> : null}
      <HomeFeatured auctions={overview?.featured ?? []} isLoading={!overview && !error} />
      <HomeAuctionSection title="Hamarosan lejár" auctions={overview?.soon_ending ?? []} />
      <HomeAuctionSection title="Új aukciók" auctions={overview?.new_auctions ?? []} />
    </>
  );
}
