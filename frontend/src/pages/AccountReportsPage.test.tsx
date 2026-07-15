import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountReportsPage } from "./AccountReportsPage";

const mocks = vi.hoisted(() => ({ listMyReports: vi.fn() }));

vi.mock("../api/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/reports")>()),
  ...mocks,
}));

describe("AccountReportsPage", () => {
  beforeEach(() => {
    mocks.listMyReports.mockResolvedValue({
      items: [
        { id: 32, target_type: "auction", auction_id: 988, auction: { id: 988, title: "One Piece Luffy alt art", status: "active" }, reported_user: null, reason: "counterfeit", details: "A kép alapján ellenőrzést kérek.", status: "under_review", public_resolution: null, created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", closed_at: null },
        { id: 33, target_type: "user", auction_id: null, auction: null, reported_user: { username: "anna", full_name: "Anna Kártyabarlang" }, reason: "suspected_fraud", details: null, status: "resolved", public_resolution: "A vizsgálat lezárult.", created_at: "2026-07-15T11:00:00Z", updated_at: "2026-07-15T12:00:00Z", closed_at: "2026-07-15T12:00:00Z" },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
  });

  it("magyar, kompakt állapotkártyákon jeleníti meg a jelentéseket", async () => {
    render(<MemoryRouter><AccountReportsPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "One Piece Luffy alt art" })).toBeInTheDocument();
    expect(screen.getByText("Hamis vagy hamisítványgyanús tétel")).toBeInTheDocument();
    expect(screen.getByText("Vizsgálat alatt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aukció megnyitása" })).toHaveAttribute("href", "/auctions/988");
    expect(screen.getByRole("heading", { name: "Anna Kártyabarlang" })).toBeInTheDocument();
    expect(screen.getByText("Csalásgyanús viselkedés")).toBeInTheDocument();
    expect(screen.getByText("Lezárva")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profil megnyitása" })).toHaveAttribute("href", "/users/anna");
    expect(screen.queryByText("counterfeit")).not.toBeInTheDocument();
    expect(screen.queryByText("under_review")).not.toBeInTheDocument();
  });
});
