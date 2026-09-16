import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Auction } from "../../api/auctions";
import { HomeAuctionSection } from "./HomeAuctionSection";

vi.mock("../../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false, isLoading: false }) }));

const auction = { id: 21, seller_id: 1, title: "Hamarosan lejáró kártya", category: "Pokemon", condition: "NM", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-10-01T10:00:00Z", five_minute_rule_enabled: false, winner_id: null, highest_bid_id: null, images: [], bid_count: 8 } as Auction;

describe("HomeAuctionSection", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("lejáró és új aukciót a meglévő kártyával, licitszámmal mutat", () => {
    const view = render(<MemoryRouter><HomeAuctionSection title="Hamarosan lejár" auctions={[auction]} /><HomeAuctionSection title="Új aukciók" auctions={[{ ...auction, id: 22, title: "Új tétel" }]} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Hamarosan lejár" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Új aukciók" })).toBeInTheDocument();
    expect(screen.getAllByText("8 licit")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Összes aukció" })).toHaveLength(2);
    view.unmount();
  });

  it.each([360, 390, 430])("%i px mobilnézetben egyenként mutatja és swipe-pal lapozza a lejáró és új aukciókat", (width) => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("max-width") && width <= Number(query.match(/\d+/)?.[0]), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as typeof window.matchMedia;
    try {
      const soon = [1, 2, 3].map((id) => ({ ...auction, id, title: `Lejáró ${id}` }));
      const newest = [4, 5, 6].map((id) => ({ ...auction, id, title: `Új ${id}` }));
      const view = render(<MemoryRouter><HomeAuctionSection title="Hamarosan lejár" auctions={soon} /><HomeAuctionSection title="Új aukciók" auctions={newest} /></MemoryRouter>);
      const soonSection = within(screen.getByRole("region", { name: "Hamarosan lejár" }));
      const newSection = within(screen.getByRole("region", { name: "Új aukciók" }));
      expect(soonSection.getByText("Lejáró 1")).toBeInTheDocument();
      expect(soonSection.queryByText("Lejáró 2")).not.toBeInTheDocument();
      expect(newSection.getByText("Új 4")).toBeInTheDocument();
      const grid = view.container.querySelector(".home-discovery-section .home-auction-grid")!;
      fireEvent.touchStart(grid, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 100 }] });
      expect(soonSection.getByText("Lejáró 2")).toBeInTheDocument();
      expect(newSection.getByText("Új 4")).toBeInTheDocument();
      fireEvent.click(newSection.getByRole("button", { name: "Előző új aukciók" }));
      expect(newSection.getByText("Új 6")).toBeInTheDocument();
      view.unmount();
    } finally { window.matchMedia = original; }
  });

  it("mobilon automatikusan lapoz, kézi vezérlés után szünetel és unmountkor takarít", () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("max-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as typeof window.matchMedia;
    try {
      const auctions = [1, 2, 3].map((id) => ({ ...auction, id, title: `Lejáró ${id}` }));
      const view = render(<MemoryRouter><HomeAuctionSection title="Hamarosan lejár" auctions={auctions} /></MemoryRouter>);
      act(() => { vi.advanceTimersByTime(6000); });
      expect(screen.getByText("Lejáró 2")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Következő hamarosan lejár" }));
      expect(screen.getByText("Lejáró 3")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(6000); });
      expect(screen.getByText("Lejáró 3")).toBeInTheDocument();
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { window.matchMedia = original; }
  });
});
