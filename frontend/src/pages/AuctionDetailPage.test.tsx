import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction, AuctionMessage } from "../api/auctions";
import { AuctionDetailPage } from "./AuctionDetailPage";

const state = vi.hoisted(() => ({ isAuthenticated: false, notificationListener: null as ((event: { id: string; type: string; payload: Record<string, unknown> }) => void) | null }));
const mocks = vi.hoisted(() => ({ getAuction: vi.fn(), listAuctionBids: vi.fn(), listAuctionReviews: vi.fn(), listRelatedAuctions: vi.fn(), listSellerOtherAuctions: vi.fn(), placeAuctionBid: vi.fn(), listAuctionMessages: vi.fn(), createAuctionMessage: vi.fn(), markAuctionMessagesRead: vi.fn(), getAuctionPresence: vi.fn(), sendTyping: vi.fn() }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), ...mocks }));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: state.isAuthenticated, user: state.isAuthenticated ? { id: 2, full_name: "Teszt licitáló" } : null }) }));
vi.mock("../NotificationContext", () => ({ useNotifications: () => ({ subscribe: (listener: typeof state.notificationListener) => { state.notificationListener = listener; return () => { state.notificationListener = null; }; } }) }));

const auction: Auction = { id: 21, seller_id: 1, title: "Részletes aukció", description: "Leírás", category: "Pokemon", condition: "fresh", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: true, buy_now_price: "2000", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-14T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [], bid_count: 2, is_owner: false };

describe("AuctionDetailPage", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    state.isAuthenticated = false;
    state.notificationListener = null;
    mocks.getAuction.mockResolvedValue(auction);
    mocks.listAuctionBids.mockResolvedValue([]);
    mocks.listAuctionReviews.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    mocks.listRelatedAuctions.mockResolvedValue([]);
    mocks.listSellerOtherAuctions.mockResolvedValue([]);
    mocks.placeAuctionBid.mockResolvedValue({ id: 1, amount: "1300.00", reaches_buy_now: false });
    mocks.listAuctionMessages.mockResolvedValue([]);
    mocks.markAuctionMessagesRead.mockResolvedValue(undefined);
    mocks.getAuctionPresence.mockResolvedValue({ online: false, last_active_at: null });
    mocks.sendTyping.mockResolvedValue(undefined);
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

  it("üres mezőnél a következő licitlépcsőt küldi, egyedi összegnél pedig egész lépcsőt kér", async () => {
    state.isAuthenticated = true;
    render(<MemoryRouter initialEntries={["/auctions/21"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);
    const bidButton = await screen.findByRole("button", { name: "Licitálok" });

    fireEvent.click(bidButton);
    await waitFor(() => expect(mocks.placeAuctionBid).toHaveBeenCalledWith(21, "1300.00"));

    fireEvent.change(screen.getByLabelText("Licit összege"), { target: { value: "1350" } });
    fireEvent.click(bidButton);
    expect(await screen.findByText("A licit 1300 Ft összegtől 100 Ft licitlépcsőkkel emelhető.")).toBeInTheDocument();
    expect(mocks.placeAuctionBid).toHaveBeenCalledTimes(1);
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

  it("Facebook-szerű lebegő chatet nyit, Enterrel egyszer küld, Shift+Enterrel nem küld", async () => {
    state.isAuthenticated = true;
    const chatAuction = { ...auction, status: "sold", winner_id: 2, can_chat: true, chat_read_only: false } as Auction;
    const created: AuctionMessage = { id: 41, sender_id: 2, message: "Szia!", created_at: "2026-07-19T18:00:00Z", read_at: null, sender: { id: 2, full_name: "Teszt licitáló", username: "teszt" } };
    mocks.getAuction.mockResolvedValue(chatAuction);
    mocks.createAuctionMessage.mockResolvedValue(created);

    render(<MemoryRouter initialEntries={["/auctions/21"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);
    const launcher = await screen.findByRole("button", { name: "Üzenetek megnyitása" });
    launcher.focus();
    fireEvent.click(launcher);
    const input = screen.getByLabelText("Üzenet a másik félnek");
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "Szia!" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.createAuctionMessage).toHaveBeenCalledTimes(1));
    expect(mocks.createAuctionMessage).toHaveBeenCalledWith(21, "Szia!");

    fireEvent.change(input, { target: { value: "Első sor\nMásodik sor" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });
    expect(mocks.createAuctionMessage).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Üzenetek megnyitása" })).toHaveFocus());
  });

  it("a POST-válasz és a realtime esemény ugyanazt az üzenetet nem duplázza", async () => {
    state.isAuthenticated = true;
    const created: AuctionMessage = { id: 52, sender_id: 2, message: "Csak egyszer", created_at: "2026-07-19T18:05:00Z", read_at: null, sender: { id: 2, full_name: "Teszt licitáló", username: "teszt" } };
    mocks.getAuction.mockResolvedValue({ ...auction, status: "sold", winner_id: 2, can_chat: true, chat_read_only: false } as Auction);
    mocks.createAuctionMessage.mockResolvedValue(created);

    render(<MemoryRouter initialEntries={["/auctions/21#auction-conversation"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);
    const input = await screen.findByLabelText("Üzenet a másik félnek");
    fireEvent.change(input, { target: { value: created.message } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await screen.findByText(created.message);
    state.notificationListener?.({ id: "message-52", type: "auction_message", payload: { ...created, auction_id: 21 } });
    await waitFor(() => expect(screen.getAllByText(created.message)).toHaveLength(1));
  });

  it("az új üzenethez automatikusan a lista aljára görget", async () => {
    state.isAuthenticated = true;
    const message: AuctionMessage = { id: 60, sender_id: 1, message: "Új üzenet", created_at: "2026-07-19T18:10:00Z", read_at: null };
    mocks.getAuction.mockResolvedValue({ ...auction, status: "sold", winner_id: 2, can_chat: true, chat_read_only: false } as Auction);
    mocks.listAuctionMessages.mockResolvedValue([message]);
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 480 });

    render(<MemoryRouter initialEntries={["/auctions/21#auction-conversation"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);
    await screen.findByText(message.message);
    const list = screen.getByLabelText("Privát beszélgetés üzenetei");
    await waitFor(() => expect(list.scrollTop).toBe(480));
  });

  it("az archivált beszélgetést megmutatja, de az üzenetküldést nem", async () => {
    state.isAuthenticated = true;
    mocks.getAuction.mockResolvedValue({ ...auction, status: "sold", winner_id: 2, can_chat: true, chat_read_only: true } as Auction);
    mocks.listAuctionMessages.mockResolvedValue([{ id: 70, sender_id: 1, message: "Korábbi üzenet", created_at: "2026-07-19T18:15:00Z", read_at: null }]);

    render(<MemoryRouter initialEntries={["/auctions/21#auction-conversation"]}><Routes><Route path="/auctions/:auctionId" element={<AuctionDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("Ez az archivált beszélgetés csak olvasható.")).toBeInTheDocument();
    expect(screen.getByText("Korábbi üzenet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Üzenet a másik félnek")).not.toBeInTheDocument();
  });
});
