import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction, AuctionMessage } from "../api/auctions";
import { IncomingChatDock } from "./IncomingChatDock";

const state = vi.hoisted(() => ({ listener: null as ((event: { id: string; type: string; payload: Record<string, unknown> }) => void) | null }));
const mocks = vi.hoisted(() => ({ getAuction: vi.fn(), listAuctionMessages: vi.fn(), markAuctionMessagesRead: vi.fn(), createAuctionMessage: vi.fn(), sendTyping: vi.fn() }));

vi.mock("../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 2, full_name: "Teszt nyertes" } }) }));
vi.mock("../NotificationContext", () => ({ useNotifications: () => ({ subscribe: (listener: typeof state.listener) => { state.listener = listener; return () => { state.listener = null; }; } }) }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), ...mocks }));

const auction = { id: 81, seller_id: 1, winner_id: 2, title: "Globális chat aukció", status: "sold", category: "Pokemon", condition: "fresh", starting_price: "1000", bid_increment: "100", current_price: "1500", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-18T10:00:00Z", ends_at: "2026-07-19T10:00:00Z", five_minute_rule_enabled: false, highest_bid_id: 9, images: [], bid_count: 4, can_chat: true, chat_read_only: false, is_owner: false } as Auction;
const incoming = { id: 91, auction_id: 81, sender_id: 1, message: "Megérkezett az új üzenet.", created_at: "2026-07-19T19:00:00Z", read_at: null, sender: { id: 1, username: "elado", full_name: "Teszt eladó" } } as AuctionMessage & { auction_id: number };

describe("IncomingChatDock", () => {
  beforeEach(() => {
    state.listener = null;
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getAuction.mockResolvedValue(auction);
    mocks.listAuctionMessages.mockResolvedValue([incoming]);
    mocks.markAuctionMessagesRead.mockResolvedValue(undefined);
    mocks.sendTyping.mockResolvedValue(undefined);
  });

  it("másik oldalon automatikusan megnyitja a másik féltől érkező chatüzenetet", async () => {
    render(<MemoryRouter initialEntries={["/account/profile"]}><IncomingChatDock /></MemoryRouter>);
    await waitFor(() => expect(state.listener).not.toBeNull());
    act(() => state.listener?.({ id: "notification-91", type: "notification", payload: { auction_id: 81, category: "chat", in_app_enabled: true } }));

    expect(await screen.findByRole("dialog", { name: "Globális chat aukció privát beszélgetése" })).toBeInTheDocument();
    expect(screen.getByText(incoming.message)).toBeInTheDocument();
    expect(mocks.getAuction).toHaveBeenCalledWith(81);
    expect(mocks.markAuctionMessagesRead).toHaveBeenCalledWith(81);
  });

  it("a saját realtime üzenettől nem nyit fel új chatpanelt", async () => {
    render(<MemoryRouter initialEntries={["/"]}><IncomingChatDock /></MemoryRouter>);
    await waitFor(() => expect(state.listener).not.toBeNull());
    act(() => state.listener?.({ id: "chat-own", type: "auction_message", payload: { ...incoming, sender_id: 2 } }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.getAuction).not.toHaveBeenCalled();
  });

  it("kikapcsolt in-app chat kategóriánál nem nyit fel panelt", async () => {
    render(<MemoryRouter initialEntries={["/account/profile"]}><IncomingChatDock /></MemoryRouter>);
    await waitFor(() => expect(state.listener).not.toBeNull());
    act(() => state.listener?.({ id: "notification-disabled", type: "notification", payload: { auction_id: 81, category: "chat", in_app_enabled: false } }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.getAuction).not.toHaveBeenCalled();
  });

  it("billentyűzettel megnyitható, Escape-re bezár és visszaadja a fókuszt", async () => {
    render(<MemoryRouter initialEntries={["/account/profile"]}><IncomingChatDock /></MemoryRouter>);
    await waitFor(() => expect(state.listener).not.toBeNull());
    act(() => state.listener?.({ id: "notification-keyboard", type: "notification", payload: { auction_id: 81, category: "chat", in_app_enabled: true } }));
    await screen.findByRole("dialog", { name: "Globális chat aukció privát beszélgetése" });
    fireEvent.click(screen.getByRole("button", { name: "Chat kis méretre zárása" }));

    const launcher = screen.getByRole("button", { name: "Legutóbbi aukciós chat megnyitása" });
    launcher.focus();
    fireEvent.click(launcher);
    await waitFor(() => expect(screen.getByLabelText("Üzenet a felugró chatben")).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Legutóbbi aukciós chat megnyitása" })).toHaveFocus());
  });
});
