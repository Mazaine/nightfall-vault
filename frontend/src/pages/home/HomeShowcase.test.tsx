import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Auction } from "../../api/auctions";
import { HomeVipShowcase } from "./HomeVipShowcase";
import { HomeLiveBids } from "./HomeLiveBids";
import { HomeCardGrid, HomeSealedProducts } from "./HomeProductSections";

vi.mock("../../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false, user: null }) }));
vi.mock("../../components/AuctionCard", () => ({
  AuctionCard: ({ item, variant, detailPath }: { item: { title: string; bidCount?: number; price: string; buyNowPrice?: string | null }; variant?: string; detailPath: string }) => variant === "live"
    ? <article className="nv-bid-card" data-testid="shared-live-auction" data-detail={detailPath}>
        <span>{item.title}</span><span>{item.bidCount} licit</span>
        <button type="button">Licitálok · min. 1 600 Ft</button>
        {item.buyNowPrice && <button type="button">⚡ Villámár {item.buyNowPrice}</button>}
      </article>
    : <article className="auction-card">{item.title}</article>,
}));

function listing(id: number, type: "auction" | "fixed" = "fixed"): Auction {
  return {
    id, seller_id: 1, title: `Tesztlap ${id}`, category: "Hatalom Kártyái Kártyajáték",
    condition: "NM", listing_type: type, listing_format: "single", status: "active",
    starting_price: "1000", current_price: "1500", bid_increment: "100",
    buy_now_enabled: true, buy_now_price: "2200",
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: new Date(Date.now() + 3600000).toISOString(),
    five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, bid_count: 3, images: [],
  };
}

describe("Újratervezett főoldal", () => {
  it("VIP nélkül három valódi hirdetés nélküli helyet mutat, a mintával egyezően", () => {
    render(<MemoryRouter><HomeVipShowcase auctions={[]} /></MemoryRouter>);
    expect(screen.getAllByText("Itt lehetne a te hirdetésed")).toHaveLength(3);
    const placeholders = screen.getAllByRole("link", { name: "Aukció létrehozása" });
    expect(placeholders).toHaveLength(3);
    placeholders.forEach(link => expect(link).toHaveAttribute("href", "/auctions/create"));
    expect(screen.getAllByText("Aukció indítása →")).toHaveLength(3);
    expect(screen.queryByText(/Tesztlap/)).not.toBeInTheDocument();
  });

  it("egy valódi VIP mellett két szabad kiemelési hely marad", () => {
    render(<MemoryRouter><HomeVipShowcase auctions={[{ ...listing(5, "auction"), bid_count: 0 }]} /></MemoryRouter>);
    expect(screen.getByText("Tesztlap 5")).toBeInTheDocument();
    expect(screen.getAllByText("Itt lehetne a te hirdetésed")).toHaveLength(2);
    expect(screen.getByText(/kikiáltási ár/)).toBeInTheDocument();
  });

  it("az élő licitblokk valós árat, licitszámot és licitlépcsőt használ", () => {
    render(<MemoryRouter><HomeLiveBids auctions={[listing(9, "auction")]} /></MemoryRouter>);
    expect(screen.getByText("Tesztlap 9")).toBeInTheDocument();
    expect(screen.getByText("3 licit")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Hamarosan záruló aukciók" }).querySelector(".nv-bids-grid")).toHaveClass("nv-bids-grid-odd");
    expect(screen.getByText(/Licitálok · min. 1\s?600 Ft/)).toHaveAttribute("href", "/auctions/9");
    expect(screen.getByText(/Villámár 2\s?200 Ft/)).toHaveAttribute("href", "/auctions/9");
  });

  it("két aktív licit esetén a teljes szélességű kétoszlopos panelrácsot használja", () => {
    render(<MemoryRouter><HomeLiveBids auctions={[listing(9, "auction"), listing(10, "auction")]} /></MemoryRouter>);
    const grid = screen.getByRole("region", { name: "Hamarosan záruló aukciók" }).querySelector(".nv-bids-grid");
    expect(grid).not.toHaveClass("nv-bids-grid-odd");
    expect(grid?.querySelectorAll(".nv-bid-card")).toHaveLength(2);
  });

  it("a két soros laplista a szerver teljes kínálatának darabszámát mutatja", () => {
    const cards = Array.from({ length: 10 }, (_, index) => listing(index + 1));
    render(<MemoryRouter><HomeCardGrid auctions={cards} total={988} /></MemoryRouter>);
    expect(screen.getByText(/988 DB/)).toBeInTheDocument();
    expect(screen.getAllByText(/Tesztlap/)).toHaveLength(10);
  });

  it("a bontatlan sor a csomagok piacterére navigál", () => {
    const booster = { ...listing(10), listing_format: "bundle" as const, shop_source: "dicemagic" };
    render(<MemoryRouter><HomeSealedProducts auctions={[booster]} total={17} /></MemoryRouter>);
    expect(screen.getByText("BONTATLAN TERMÉKEK")).toBeInTheDocument();
    expect(screen.getByText(/17 DB/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Összes bontatlan" })).toHaveAttribute("href", "/marketplace?tab=bundles");
  });
});
