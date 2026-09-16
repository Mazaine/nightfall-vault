import type { Auction } from "../../api/auctions";
import { HomeAuctionCarousel } from "./HomeAuctionCarousel";
import { HomeTrustPanel } from "./HomeTrustPanel";

export function HomeFeatured({ auctions, isLoading = false }: { auctions: Auction[]; isLoading?: boolean }) {
  return <HomeAuctionCarousel title="Kiemelt aukciók" auctions={auctions} isLoading={isLoading} emptyTitle="Jelenleg nincs aktív vagy hamarosan induló kiemelt aukció" sectionClassName="home-featured-section"><HomeTrustPanel /></HomeAuctionCarousel>;
}
