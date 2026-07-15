import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction } from "../api/auctions";
import { AuctionDetailPage } from "./AuctionDetailPage";

const mocks = vi.hoisted(() => ({ getAuction: vi.fn(), listAuctionBids: vi.fn(), listAuctionReviews: vi.fn(), listRelatedAuctions: vi.fn(), listSellerOtherAuctions: vi.fn() }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), ...mocks }));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false }) }));

const auction: Auction = { id: 21, seller_id: 1, title: "Részletes aukció", description: "Leírás", category: "Pokemon", condition: "fresh", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: true, buy_now_price: "2000", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-14T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [], bid_count: 2, is_owner: false };

describe("AuctionDetailPage", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getAuction.mockResolvedValue(auction);
    mocks.listAuctionBids.mockResolvedValue([]);
    mocks.listAuctionReviews.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    mocks.listRelatedAuctions.mockResolvedValue([]);
    mocks.listSellerOtherAuctions.mockResolvedValue([]);
  });

  it("kijelentkezett látogatónak bejelentkezési CTA-t ad", async () => {
    render(<MemoryRouter initialEntries={["/auctions/21"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Jelentkezz be a licitáláshoz" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bejelentkezés a licitáláshoz" })).toHaveAttribute("href", "/login?next=%2Fauctions%2F21");
    expect(screen.queryByRole("button", { name: "Licitálok" })).not.toBeInTheDocument();
  });

  it("hibás slugnál civilizált 404 nézetet ad API-hívás nélkül", async () => {
    render(<MemoryRouter initialEntries={["/auctions/nem-letezik"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Az aukció nem található" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aukciók böngészése" })).toHaveAttribute("href", "/auctions");
    expect(mocks.getAuction).not.toHaveBeenCalled();
  });

  it("a teljes képet mutatja és a galéria további képei között lapoz", async () => {
    mocks.getAuction.mockResolvedValue({
      ...auction,
      images: [
        { id: 1, auction_id: 21, storage_key: "one.webp", url: "/media/one.webp", detail_url: "/media/one-detail.webp", thumbnail_url: "/media/one-thumb.webp", original_filename: "one.png", content_type: "image/webp", file_size: 100, position: 0, is_cover: true, created_at: "2026-07-01T10:00:00Z" },
        { id: 2, auction_id: 21, storage_key: "two.webp", url: "/media/two.webp", detail_url: "/media/two-detail.webp", thumbnail_url: "/media/two-thumb.webp", original_filename: "two.png", content_type: "image/webp", file_size: 100, position: 1, is_cover: false, created_at: "2026-07-01T10:01:00Z" },
      ],
    });

    render(<MemoryRouter initialEntries={["/auctions/21"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);

    const firstImage = await screen.findByRole("img", { name: "Részletes aukció – 1. kép" });
    expect(firstImage).toHaveAttribute("src", expect.stringContaining("/media/one-detail.webp"));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Következő kép" }));
    await waitFor(() => expect(screen.getByRole("img", { name: "Részletes aukció – 2. kép" })).toHaveAttribute("src", expect.stringContaining("/media/two-detail.webp")));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1. kép megnyitása" }));
    expect(await screen.findByRole("img", { name: "Részletes aukció – 1. kép" })).toBeInTheDocument();
  });
});
