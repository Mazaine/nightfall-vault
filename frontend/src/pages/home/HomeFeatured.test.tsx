import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Auction } from "../../api/auctions";
import { HomeFeatured } from "./HomeFeatured";

vi.mock("../../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false, isLoading: false }) }));

function auction(id: number): Auction {
  return { id, seller_id: 1, title: `Kiemelt ${id}`, category: "Pokemon", condition: "like_new", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: true, buy_now_price: "2000", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-10-14T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [], bid_count: 2, is_featured: true };
}

const renderFeatured = (count = 5) => render(<MemoryRouter><HomeFeatured auctions={Array.from({ length: count }, (_, index) => auction(index + 1))} /></MemoryRouter>);

describe("HomeFeatured", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("négy kártyát mutat, kézzel lapoz és körbefordul", () => {
    renderFeatured();
    expect(screen.getByText("Kiemelt 4")).toBeInTheDocument();
    expect(screen.queryByText("Kiemelt 5")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Következő kiemelt aukciók" }));
    expect(screen.getByText("Kiemelt 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Következő kiemelt aukciók" }));
    expect(screen.getByText("Kiemelt 1")).toBeInTheDocument();
  });

  it("6 másodpercenként vált, hover és kézi vezérlés után szünetel", () => {
    const view = renderFeatured();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText("Kiemelt 5")).toBeInTheDocument();
    fireEvent.mouseEnter(view.container.querySelector(".home-featured-section")!);
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.getByText("Kiemelt 5")).toBeInTheDocument();
    fireEvent.mouseLeave(view.container.querySelector(".home-featured-section")!);
    fireEvent.click(screen.getByRole("button", { name: "Előző kiemelt aukciók" }));
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText("Kiemelt 1")).toBeInTheDocument();
  });

  it("reduced motion mellett nincs autoplay, unmountkor takarít", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("prefers-reduced-motion"), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as typeof window.matchMedia;
    try {
      const view = renderFeatured();
      act(() => { vi.advanceTimersByTime(18000); });
      expect(screen.getByText("Kiemelt 1")).toBeInTheDocument();
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { window.matchMedia = original; }
  });

  it.each([360, 390, 430])("%i px mobilnézetben egy kártyát mutat és swipe-pal lapoz", (width) => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("max-width") && width <= Number(query.match(/\d+/)?.[0]), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as typeof window.matchMedia;
    try {
      const view = renderFeatured(3);
      expect(screen.getByText("Kiemelt 1")).toBeInTheDocument();
      expect(screen.queryByText("Kiemelt 2")).not.toBeInTheDocument();
      const grid = view.container.querySelector(".home-auction-grid")!;
      fireEvent.touchStart(grid, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 100 }] });
      expect(screen.getByText("Kiemelt 2")).toBeInTheDocument();
    } finally { window.matchMedia = original; }
  });
});
