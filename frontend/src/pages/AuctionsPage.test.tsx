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
    expect(screen.getByRole("link", { name: "Aukció létrehozása" })).toHaveAttribute("href", "/account/auctions");
    expect(await screen.findByRole("link", { name: "Publikus aukció" })).toHaveAttribute("href", "/auctions/12");
    expect(screen.getByRole("button", { name: "Licitálok" })).toBeInTheDocument();
  });

  it("üres backend válaszhoz értelmes állapotot ad", async () => {
    mocks.listAuctions.mockResolvedValue({ items: [], total: 0, limit: 24, offset: 0 });
    render(<MemoryRouter><AuctionsPage /></MemoryRouter>);
    expect(await screen.findByText("Nincs a szűrésnek megfelelő aukció.")).toBeInTheDocument();
  });

  it("a kártyán az API list variáns URL-jét használja", async () => {
    mocks.listAuctions.mockResolvedValue({ items: [{ ...auction, images: [{ id: 1, auction_id: 12, storage_key: "legacy-original", url: "/media/original.webp", list_url: "/media/list.webp", original_filename: "card.png", content_type: "image/webp", file_size: 10, position: 0, is_cover: true, created_at: "2026-07-01T10:00:00Z" }] }], total: 1, limit: 24, offset: 0 });
    render(<MemoryRouter><AuctionsPage /></MemoryRouter>);
    expect(await screen.findByRole("img", { name: "Publikus aukció" })).toHaveAttribute("src", "http://localhost:8000/media/list.webp");
  });
});
