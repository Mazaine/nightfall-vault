import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction } from "../api/auctions";
import { AuctionsPage } from "./AuctionsPage";

const mocks = vi.hoisted(() => ({ listAuctions: vi.fn() }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), listAuctions: mocks.listAuctions }));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false }) }));

const auction: Auction = { id: 12, seller_id: 1, title: "Publikus aukció", category: "Pokemon", condition: "fresh", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1300", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-14T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [], bid_count: 3 };

describe("AuctionsPage", () => {
  beforeEach(() => mocks.listAuctions.mockReset());

  it("backend találatot navigálható kártyán jelenít meg", async () => {
    mocks.listAuctions.mockResolvedValue({ items: [auction], total: 1, limit: 24, offset: 0 });
    render(<MemoryRouter><AuctionsPage /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Publikus aukció" })).toHaveAttribute("href", "/auctions/12");
    expect(screen.getByRole("link", { name: "Licitálok" })).toHaveAttribute("href", "/auctions/12#bid-section");
  });

  it("üres backend válaszhoz értelmes állapotot ad", async () => {
    mocks.listAuctions.mockResolvedValue({ items: [], total: 0, limit: 24, offset: 0 });
    render(<MemoryRouter><AuctionsPage /></MemoryRouter>);
    expect(await screen.findByText("Nincs a szűrésnek megfelelő aukció.")).toBeInTheDocument();
  });
});
