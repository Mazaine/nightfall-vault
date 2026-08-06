import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionCard } from "./AuctionCard";

const state = vi.hoisted(() => ({ isAuthenticated: true }));
const mocks = vi.hoisted(() => ({ placeAuctionBid: vi.fn(), withdrawAuctionBid: vi.fn() }));
vi.mock("../AuthContext", () => ({ useAuth: () => state }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), placeAuctionBid: mocks.placeAuctionBid, withdrawAuctionBid: mocks.withdrawAuctionBid }));

const item = { id: 7, title: "Teszt kártya", type: "Pokemon", price: "1 200 Ft", step: "100 Ft", currentAmount: "1200.00", bidIncrementAmount: "100.00", time: "2 óra", sellerName: "Anna Kártyabarlang", sellerRating: 4, bidCount: 2, buyNowPrice: "2 000 Ft", buyNowAmount: "2000.00", imageUrl: "https://example.test/card.png", canBid: true };

function Location() {
  return <span data-testid="location">{useLocation().pathname}{useLocation().hash}</span>;
}

describe("AuctionCard", () => {
  beforeEach(() => {
    state.isAuthenticated = true;
    mocks.placeAuctionBid.mockReset();
    mocks.placeAuctionBid.mockResolvedValue({ id: 1, amount: "1300.00", reaches_buy_now: false });
    mocks.withdrawAuctionBid.mockReset();
    mocks.withdrawAuctionBid.mockResolvedValue({ current_price: "1200.00" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("a teljes kártya kattintható, a műveleti gomb nem navigál", async () => {
    render(<MemoryRouter><Routes><Route path="*" element={<><AuctionCard item={item} index={0} detailPath="/auctions/7" /><Location /></>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: /Teszt kártya aukció/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/auctions/7");
    render(<MemoryRouter initialEntries={["/"]}><Routes><Route path="*" element={<><AuctionCard item={item} index={0} detailPath="/auctions/7" /><Location /></>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button", { name: "Licitálok" })[0]);
    await waitFor(() => expect(mocks.placeAuctionBid).toHaveBeenCalled());
    expect(screen.getAllByTestId("location")[1]).toHaveTextContent("/");
  });

  it("szöveges személyes állapotot és megerősített Kiszállok műveletet ad", async () => {
    const leading = { ...item, personalStatus: "leading" as const, topBidId: 99, canWithdraw: true };
    render(<MemoryRouter><AuctionCard item={leading} index={0} detailPath="/auctions/7" /></MemoryRouter>);
    expect(screen.getByText("Te vezetsz")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kiszállok" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("A legutolsó licited semmissé válik"));
    await waitFor(() => expect(mocks.withdrawAuctionBid).toHaveBeenCalledWith(99, "leave_auction", null));
    expect(await screen.findByText("Kiszálltál")).toBeInTheDocument();
  });

  it("a Licitálok a következő licitlépcsőt küldi navigáció nélkül", async () => {
    render(<MemoryRouter initialEntries={["/"]}><Routes><Route path="*" element={<><AuctionCard item={item} index={0} detailPath="/auctions/7" /><Location /></>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Licitálok" }));
    await waitFor(() => expect(mocks.placeAuctionBid).toHaveBeenCalledWith(7, "1300.00"));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(await screen.findByText("A licit sikeresen rögzítve: 1300 Ft.")).toBeInTheDocument();
  });

  it("a Lecsapom a villámárat küldi és lezárja a kártyát", async () => {
    mocks.placeAuctionBid.mockResolvedValue({ id: 2, amount: "2000.00", reaches_buy_now: true });
    render(<MemoryRouter><AuctionCard item={item} index={0} detailPath="/auctions/7" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "⚡ Lecsapom" }));
    await waitFor(() => expect(mocks.placeAuctionBid).toHaveBeenCalledWith(7, "2000.00"));
    expect(await screen.findByText("Megnyerted az aukciót villámáron.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Licitálok" })).not.toBeInTheDocument();
  });

  it("az eladó értékelését csillagokkal, a licitszámot külön jeleníti meg", () => {
    render(<MemoryRouter><AuctionCard item={item} index={0} detailPath="/auctions/7" /></MemoryRouter>);
    expect(screen.getByText("Eladó: Anna Kártyabarlang")).toBeInTheDocument();
    expect(screen.getByLabelText("4 csillag az 5-ből")).toHaveTextContent("★★★★☆");
    expect(screen.getByText("2 licit")).toBeInTheDocument();
  });

  it("hibás kép helyett hozzáférhető fallbacket mutat", () => {
    render(<MemoryRouter><AuctionCard item={item} index={0} detailPath="/auctions/7" /></MemoryRouter>);
    fireEvent.error(screen.getByRole("img", { name: "Teszt kártya" }));
    expect(screen.getByRole("img", { name: "Teszt kártya – kép nem érhető el" })).toHaveTextContent("Kép nem érhető el");
  });
});
