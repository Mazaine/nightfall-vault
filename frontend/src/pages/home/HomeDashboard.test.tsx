import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { HomeAuctionOverview } from "../../api/auctions";
import { HomeDashboard } from "./HomeDashboard";

vi.mock("../../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true, isLoading: false }) }));

const overview: HomeAuctionOverview = { active_count: 18, active_bid_count: 3, outbid_count: 1, draft_count: 0, open_transaction_count: 3, featured: [], soon_ending: [], new_auctions: [] };

describe("HomeDashboard", () => {
  it("aktív, személyes és tranzakciós kártyákat jelenít meg, nullákat nem", () => {
    render(<MemoryRouter><HomeDashboard overview={overview} /></MemoryRouter>);
    expect(screen.getByText("18 aktív aukció").closest("a")).toHaveAttribute("href", "/auctions?status=active");
    expect(screen.getByText("3 aktív licited van")).toBeInTheDocument();
    expect(screen.getByText("1 aukción túllicitáltak")).toBeInTheDocument();
    expect(screen.getByText("3 nyitott tranzakciód van")).toBeInTheDocument();
    expect(screen.queryByText(/piszkozat vár/)).not.toBeInTheDocument();
  });
  it("személyes nullaállapotot elrejti", () => {
    render(<MemoryRouter><HomeDashboard overview={{ ...overview, active_bid_count: 0, outbid_count: 0, open_transaction_count: 0 }} /></MemoryRouter>);
    expect(screen.queryByText(/aktív licited/)).not.toBeInTheDocument();
    expect(screen.queryByText(/túllicitáltak/)).not.toBeInTheDocument();
    expect(screen.getByText("18 aktív aukció")).toBeInTheDocument();
  });
});
