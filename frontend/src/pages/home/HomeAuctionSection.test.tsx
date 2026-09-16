import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Auction } from "../../api/auctions";
import { HomeAuctionSection } from "./HomeAuctionSection";

vi.mock("../../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false, isLoading: false }) }));

const auction = { id: 21, seller_id: 1, title: "Hamarosan lejáró kártya", category: "Pokemon", condition: "NM", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-10-01T10:00:00Z", five_minute_rule_enabled: false, winner_id: null, highest_bid_id: null, images: [], bid_count: 8 } as Auction;

describe("HomeAuctionSection", () => {
  it("lejáró és új aukciót a meglévő kártyával, licitszámmal mutat", () => {
    const view = render(<MemoryRouter><HomeAuctionSection title="Hamarosan lejár" auctions={[auction]} /><HomeAuctionSection title="Új aukciók" auctions={[{ ...auction, id: 22, title: "Új tétel" }]} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Hamarosan lejár" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Új aukciók" })).toBeInTheDocument();
    expect(screen.getAllByText("8 licit")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Összes aukció" })).toHaveLength(2);
    view.unmount();
  });
});
