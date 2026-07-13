import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuctionCard } from "./AuctionCard";

const item = { id: 7, title: "Teszt kártya", type: "Pokemon", price: "1 200 Ft", step: "100 Ft", time: "2 óra", sellerName: "Anna", sellerRating: "2 licit", buyNowPrice: "2 000 Ft", imageUrl: "https://example.test/card.png", canBid: true };

function Location() {
  return <span data-testid="location">{useLocation().pathname}{useLocation().hash}</span>;
}

describe("AuctionCard", () => {
  it("a kép, cím és CTA-k valós célokra mutatnak", () => {
    render(<MemoryRouter><AuctionCard item={item} index={0} detailPath="/auctions/7" /></MemoryRouter>);
    expect(screen.getByRole("img", { name: "Teszt kártya" }).closest("a")).toHaveAttribute("href", "/auctions/7");
    expect(screen.getByRole("link", { name: "Teszt kártya" })).toHaveAttribute("href", "/auctions/7");
    expect(screen.getByRole("link", { name: "Licitálok" })).toHaveAttribute("href", "/auctions/7#bid-section");
    expect(screen.getByRole("link", { name: "⚡ Lecsapom" })).toHaveAttribute("href", "/auctions/7#buy-now-section");
  });

  it("billentyűzettel megnyitja a részletezőt", () => {
    render(<MemoryRouter><Routes><Route path="*" element={<><AuctionCard item={item} index={0} detailPath="/auctions/7" /><Location /></>} /></Routes></MemoryRouter>);
    fireEvent.keyDown(screen.getByRole("link", { name: "Teszt kártya aukció megnyitása" }), { key: "Enter" });
    expect(screen.getByTestId("location")).toHaveTextContent("/auctions/7");
  });
});
