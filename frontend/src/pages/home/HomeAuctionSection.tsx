import type { Auction } from "../../api/auctions";
import { HomeAuctionCarousel } from "./HomeAuctionCarousel";

export function HomeAuctionSection({ title, auctions }: { title: string; auctions: Auction[] }) {
  if (!auctions.length) return null;
  return <HomeAuctionCarousel title={title} auctions={auctions} sectionClassName="home-discovery-section" />;
}
