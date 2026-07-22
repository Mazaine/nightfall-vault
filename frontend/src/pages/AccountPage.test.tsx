import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction, MyBidAuction } from "../api/auctions";
import { AccountPage } from "./AccountPage";

const mocks = vi.hoisted(() => ({
  listMyBidAuctions: vi.fn(),
  listMyAuctions: vi.fn(),
  realtimeListener: null as null | ((event: { type: string; payload: Record<string, unknown> }) => void),
  showToast: vi.fn(),
}));

vi.mock("../api/auctions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/auctions")>();
  return { ...original, listMyBidAuctions: mocks.listMyBidAuctions, listMyAuctions: mocks.listMyAuctions };
});
vi.mock("../NotificationContext", () => ({
  useNotifications: () => ({
    subscribe: (listener: (event: { type: string; payload: Record<string, unknown> }) => void) => {
      mocks.realtimeListener = listener;
      return () => { mocks.realtimeListener = null; };
    },
    showToast: mocks.showToast,
  }),
}));

function auction(id: number, status: Auction["status"]): Auction {
  return { id, seller_id: 2, title: `Teszt aukció ${id}`, category: "Kártya", condition: "like_new", status, starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-14T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [], bid_count: 2 };
}

function bidItem(id: number, status: Auction["status"], flags: Partial<MyBidAuction> = {}): MyBidAuction {
  return { auction: auction(id, status), my_highest_bid: "1200", is_leading: false, has_won: false, is_outbid: false, ...flags };
}

describe("AccountPage bids", () => {
  beforeEach(() => { mocks.listMyBidAuctions.mockReset(); mocks.listMyAuctions.mockReset(); mocks.showToast.mockReset(); mocks.realtimeListener = null; });

  it("loading skeleton állapotot jelenít meg", () => {
    mocks.listMyBidAuctions.mockReturnValue(new Promise(() => undefined));
    render(<MemoryRouter><AccountPage section="bids" /></MemoryRouter>);
    expect(screen.getByRole("status", { name: "Licitált aukciók betöltése" })).toBeInTheDocument();
  });

  it("értelmes empty állapotot és műveletet ad", async () => {
    mocks.listMyBidAuctions.mockResolvedValue([]);
    render(<MemoryRouter><AccountPage section="bids" /></MemoryRouter>);
    const heading = await screen.findByRole("heading", { name: "Még nincs licited" });
    expect(heading).toBeInTheDocument();
    expect(within(heading.parentElement as HTMLElement).getByRole("link", { name: "Aukciók böngészése" })).toHaveAttribute("href", "/auctions");
  });

  it("elkülöníti az aktív, megnyert és elvesztett aukciókat", async () => {
    mocks.listMyBidAuctions.mockResolvedValue([bidItem(1, "active", { is_leading: true }), bidItem(2, "sold", { has_won: true }), bidItem(3, "sold", { is_outbid: true })]);
    render(<MemoryRouter><AccountPage section="bids" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Aktív licitjeim (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Megnyert aukciók (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elvesztett aukciók (1)" })).toBeInTheDocument();
  });

  it("frissítés nélkül Rád licitáltak állapotra vált a realtime értesítéskor", async () => {
    mocks.listMyBidAuctions.mockResolvedValue([bidItem(1, "active", { is_leading: true })]);
    render(<MemoryRouter><AccountPage section="bids" /></MemoryRouter>);
    expect(await screen.findByText("Te vezetsz")).toBeInTheDocument();

    act(() => mocks.realtimeListener?.({ type: "notification", payload: { type: "outbid", auction_id: 1 } }));

    expect(screen.getByText("Rád licitáltak")).toBeInTheDocument();
    expect(screen.queryByText("Te vezetsz")).not.toBeInTheDocument();
  });

  it("hiba után újrapróbálható", async () => {
    mocks.listMyBidAuctions.mockRejectedValueOnce(new Error("Átmeneti hiba")).mockResolvedValueOnce([]);
    render(<MemoryRouter><AccountPage section="bids" /></MemoryRouter>);
    const retry = await screen.findByRole("button", { name: "Újrapróbálás" });
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "Még nincs licited" })).toBeInTheDocument();
    expect(mocks.listMyBidAuctions).toHaveBeenCalledTimes(2);
  });
});
