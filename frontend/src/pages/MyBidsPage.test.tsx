import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyBidsPage } from "./MyBidsPage";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), listMyBidAuctionsPage: mocks.list }));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true }) }));

const auction = {
  id: 44, seller_id: 2, title: "Ritka kártya", category: "Pokemon", condition: "fresh", status: "active",
  starting_price: "1000", bid_increment: "200", current_price: "1800", buy_now_enabled: false, buy_now_price: null,
  starts_at: "2026-08-01T10:00:00Z", ends_at: "2026-08-08T10:00:00Z", five_minute_rule_enabled: true,
  winner_id: null, highest_bid_id: 8, images: [], bid_count: 3,
};

describe("MyBidsPage", () => {
  beforeEach(() => mocks.list.mockReset());

  it("szűrhető, személyes állapotot és közös aukciókártyát jelenít meg", async () => {
    mocks.list.mockResolvedValue({ items: [{ auction, my_highest_bid: "1600", is_leading: false, has_won: false, is_outbid: true, transaction_id: null }], total: 1, limit: 12, offset: 0, server_time: new Date().toISOString() });
    render(<MemoryRouter><MyBidsPage /></MemoryRouter>);
    expect(await screen.findByText("Túllicitáltak")).toBeInTheDocument();
    expect(screen.getByText("1800 Ft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Licitálok" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Én vezetek" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith("leading", 12, 0));
  });
});
