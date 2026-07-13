import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction } from "../../api/auctions";
import { HomeFeatured } from "./HomeFeatured";

const mocks = vi.hoisted(() => ({ listAuctions: vi.fn() }));
vi.mock("../../api/auctions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/auctions")>()),
  listAuctions: mocks.listAuctions,
}));

function auction(id: number, status: Auction["status"] = "active"): Auction {
  return { id, seller_id: 1, title: `Kiemelt ${id}`, category: "Pokemon", condition: "like_new", status, starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: true, buy_now_price: "2000", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-14T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [], bid_count: 2 };
}

describe("HomeFeatured", () => {
  beforeEach(() => mocks.listAuctions.mockReset());

  it("loading állapotot mutat", async () => {
    let resolveRequest: (value: { items: Auction[]; total: number; limit: number; offset: number }) => void = () => undefined;
    mocks.listAuctions.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<MemoryRouter><HomeFeatured /></MemoryRouter>);
    expect(screen.getByRole("status", { name: "Kiemelt aukciók betöltése" })).toBeInTheDocument();
    await act(async () => resolveRequest({ items: [], total: 0, limit: 4, offset: 0 }));
    expect(await screen.findByRole("heading", { name: "Jelenleg nincs aktív vagy hamarosan induló aukció" })).toBeInTheDocument();
  });

  it("legfeljebb négy backend aukciót jelenít meg", async () => {
    mocks.listAuctions
      .mockResolvedValueOnce({ items: [1, 2, 3].map((id) => auction(id)), total: 3, limit: 4, offset: 0 })
      .mockResolvedValueOnce({ items: [4, 5].map((id) => auction(id, "scheduled")), total: 2, limit: 4, offset: 0 });
    render(<MemoryRouter><HomeFeatured /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Kiemelt 1" })).toHaveAttribute("href", "/auctions/1");
    expect(screen.queryByText("Kiemelt 5")).not.toBeInTheDocument();
    expect(mocks.listAuctions).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: "active", limit: 4 }));
  });

  it("hiba után újrapróbálható", async () => {
    mocks.listAuctions.mockRejectedValueOnce(new Error("Átmeneti hiba")).mockResolvedValue({ items: [], total: 0, limit: 4, offset: 0 });
    render(<MemoryRouter><HomeFeatured /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Újrapróbálás" }));
    expect(await screen.findByRole("heading", { name: "Jelenleg nincs aktív vagy hamarosan induló aukció" })).toBeInTheDocument();
  });
});
