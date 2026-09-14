import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction, MyBidAuction } from "../api/auctions";
import { renderWithProviders } from "../test/renderWithProviders";
import { AccountPage } from "./AccountPage";

const mocks = vi.hoisted(() => ({
  listMyBidAuctions: vi.fn(),
  listMyAuctions: vi.fn(),
  cancelAuction: vi.fn(),
  realtimeListener: null as null | ((event: { type: string; payload: Record<string, unknown> }) => void),
  showToast: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock("../api/auctions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/auctions")>();
  return { ...original, cancelAuction: mocks.cancelAuction, listMyBidAuctions: mocks.listMyBidAuctions, listMyAuctions: mocks.listMyAuctions };
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
vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auth")>()),
  getMe: mocks.getMe,
}));

const authUser = { id: 1, email: "bidder@example.invalid", username: "bidder", full_name: "Teszt Licitáló", role: "user" as const, is_vip: false, vip_expires_at: null };

function auction(id: number, status: Auction["status"]): Auction {
  return { id, seller_id: 2, title: `Teszt aukció ${id}`, category: "Kártya", condition: "like_new", status, starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-14T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [], bid_count: 2 };
}

function bidItem(id: number, status: Auction["status"], flags: Partial<MyBidAuction> = {}): MyBidAuction {
  return { auction: auction(id, status), my_highest_bid: "1200", is_leading: false, has_won: false, is_outbid: false, ...flags };
}

describe("AccountPage bids", () => {
  beforeEach(() => { mocks.listMyBidAuctions.mockReset(); mocks.listMyAuctions.mockReset(); mocks.cancelAuction.mockReset().mockResolvedValue({ id: 1, status: "cancelled" }); mocks.showToast.mockReset(); mocks.getMe.mockReset(); mocks.getMe.mockResolvedValue(authUser); mocks.realtimeListener = null; });

  it("loading skeleton állapotot jelenít meg", () => {
    mocks.getMe.mockReturnValue(new Promise(() => undefined));
    mocks.listMyBidAuctions.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<AccountPage section="bids" />);
    expect(screen.getByRole("status", { name: "Licitált aukciók betöltése" })).toBeInTheDocument();
  });

  it("értelmes empty állapotot és műveletet ad", async () => {
    mocks.listMyBidAuctions.mockResolvedValue([]);
    renderWithProviders(<AccountPage section="bids" />);
    const heading = await screen.findByRole("heading", { name: "Még nincs licited" });
    expect(heading).toBeInTheDocument();
    expect(within(heading.parentElement as HTMLElement).getByRole("link", { name: "Aukciók böngészése" })).toHaveAttribute("href", "/auctions");
  });

  it("elkülöníti az aktív, megnyert és elvesztett aukciókat", async () => {
    mocks.listMyBidAuctions.mockResolvedValue([bidItem(1, "active", { is_leading: true }), bidItem(2, "sold", { has_won: true }), bidItem(3, "sold", { is_outbid: true })]);
    renderWithProviders(<AccountPage section="bids" />);
    expect(await screen.findByRole("heading", { name: "Aktív licitjeim (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Megnyert aukciók (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elvesztett aukciók (1)" })).toBeInTheDocument();
  });

  it("frissítés nélkül Rád licitáltak állapotra vált a realtime értesítéskor", async () => {
    mocks.listMyBidAuctions.mockResolvedValue([bidItem(1, "active", { is_leading: true })]);
    renderWithProviders(<AccountPage section="bids" />);
    expect(await screen.findByText("Te vezetsz")).toBeInTheDocument();

    act(() => mocks.realtimeListener?.({ type: "notification", payload: { type: "outbid", auction_id: 1 } }));

    expect(screen.getByText("Rád licitáltak")).toBeInTheDocument();
    expect(screen.queryByText("Te vezetsz")).not.toBeInTheDocument();
  });

  it("hiba után újrapróbálható", async () => {
    mocks.listMyBidAuctions.mockRejectedValueOnce(new Error("Átmeneti hiba")).mockResolvedValueOnce([]);
    renderWithProviders(<AccountPage section="bids" />);
    const retry = await screen.findByRole("button", { name: "Újrapróbálás" });
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "Még nincs licited" })).toBeInTheDocument();
    expect(mocks.listMyBidAuctions).toHaveBeenCalledTimes(2);
  });

  it("az aukciót csak a megerősítő dialog destruktív gombja után szakítja meg", async () => {
    mocks.listMyAuctions.mockResolvedValue([auction(1, "active")]);
    renderWithProviders(<AccountPage section="auctions" />);
    fireEvent.click(await screen.findByRole("button", { name: "Megszakítás" }));
    expect(screen.getByRole("dialog", { name: "Biztosan megszakítod az aukciót?" })).toBeInTheDocument();
    expect(screen.getByText(/már 2 licit érkezett/i)).toBeInTheDocument();
    expect(mocks.cancelAuction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mégse" }));
    expect(mocks.cancelAuction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Megszakítás" }));
    fireEvent.click(screen.getByRole("button", { name: "Igen, aukció megszakítása" }));
    await vi.waitFor(() => expect(mocks.cancelAuction).toHaveBeenCalledWith(1));
  });
});
