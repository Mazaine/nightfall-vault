import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuctionRealtimeSnapshot, HomeAuctionOverview } from "../api/auctions";
import { HomePage } from "./HomePage";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listener: null as null | ((snapshot: AuctionRealtimeSnapshot) => void),
  unsubscribe: vi.fn(),
}));
vi.mock("../api/auctions", async (original) => ({ ...(await original<typeof import("../api/auctions")>()), getHomeAuctionOverview: mocks.get }));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ isLoading: false, user: null }) }));
vi.mock("../AuctionRealtimeContext", () => {
  const subscribe = (listener: (snapshot: AuctionRealtimeSnapshot) => void) => { mocks.listener = listener; return mocks.unsubscribe; };
  return { useAuctionRealtime: () => ({ subscribe }) };
});
vi.mock("./home/HomeHero", () => ({ HomeHero: () => <div>Hero</div> }));
vi.mock("./home/HomeDashboard", () => ({ HomeDashboard: ({ overview }: { overview: HomeAuctionOverview | null }) => <div data-testid="active-count">{overview?.active_count}</div> }));
vi.mock("./home/HomeFeatured", () => ({ HomeFeatured: ({ auctions }: { auctions: HomeAuctionOverview["featured"] }) => <div data-testid="bid-count">{auctions[0]?.bid_count}</div> }));
vi.mock("./home/HomeAuctionSection", () => ({ HomeAuctionSection: () => null }));

const initial: HomeAuctionOverview = { active_count: 1, active_bid_count: 0, outbid_count: 0, draft_count: 0, open_transaction_count: 0, featured: [{ id: 5, seller_id: 1, title: "Kiemelt", category: "Pokemon", condition: "NM", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-10-01T10:00:00Z", five_minute_rule_enabled: false, winner_id: null, highest_bid_id: null, images: [], bid_count: 2 }], soon_ending: [], new_auctions: [] };

describe("HomePage realtime", () => {
  afterEach(() => { vi.useRealTimers(); mocks.get.mockReset(); mocks.listener = null; mocks.unsubscribe.mockReset(); });
  it("SSE után azonnal frissíti a licitszámot, majd összevontan újrakéri a számlálókat", async () => {
    mocks.get.mockResolvedValueOnce(initial).mockResolvedValue({ ...initial, active_count: 2, featured: [{ ...initial.featured[0], bid_count: 3 }] });
    const view = render(<HomePage />);
    await waitFor(() => expect(screen.getByTestId("bid-count")).toHaveTextContent("2"));
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    vi.useFakeTimers();
    act(() => { mocks.listener?.({ auction_id: 5, status: "active", current_price: "1300", highest_bid_id: 9, winner_id: null, ends_at: "2026-10-01T10:00:00Z", bid_count: 3, bids: [] }); });
    expect(screen.getByTestId("bid-count")).toHaveTextContent("3");
    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("active-count")).toHaveTextContent("2");
    view.unmount();
    if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor);
    expect(mocks.unsubscribe).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
