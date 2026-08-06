import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDemoAuctionsPage } from "./AdminDemoAuctionsPage";

const mocks = vi.hoisted(() => ({
  getDemoAuctionStatus: vi.fn(), previewDemoAuctions: vi.fn(), previewDemoCleanup: vi.fn(),
  createDemoAuctions: vi.fn(), resetDemoAuctions: vi.fn(), cleanupDemoAuctions: vi.fn(),
}));
vi.mock("../../api/admin", async (original) => ({ ...(await original<typeof import("../../api/admin")>()), ...mocks }));

describe("Admin demóaukciók", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getDemoAuctionStatus.mockResolvedValue({ batch_key: null, status: "none", regular_count: 0, featured_count: 0, total_auctions: 0, image_count: 0, media_variant_count: 0, bid_count: 0, demo_user_count: 0, created_at: null, completed_at: null, deleted_at: null, created_by_admin: null, error_message: null });
    mocks.previewDemoAuctions.mockResolvedValue({ regular_count: 80, featured_count: 20, total_auctions: 100, image_count: 100, media_variant_count: 400, expected_bid_count: 66, categories: ["Pokemon"], earliest_end_at: "2026-08-07T00:00:00Z", latest_end_at: "2026-08-19T00:00:00Z", buy_now_count: 25, five_minute_rule_count: 50, demo_user_count: 5 });
    mocks.createDemoAuctions.mockResolvedValue({ action: "create", batch_key: "batch-1", status: "active", regular_count: 80, featured_count: 20, total_auctions: 100, image_count: 100, bid_count: 66, deleted_records: 0 });
  });

  it("80 és 20 alapértékkel előnézetet készít", async () => {
    render(<AdminDemoAuctionsPage />);
    expect(await screen.findByRole("heading", { name: "Aktuális állapot" })).toBeInTheDocument();
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(80); expect(inputs[1]).toHaveValue(20);
    fireEvent.click(screen.getByRole("button", { name: "Előnézet" }));
    await waitFor(() => expect(mocks.previewDemoAuctions).toHaveBeenCalledWith(80, 20));
    expect(await screen.findByText(/80 normál \+ 20 kiemelt = 100 aukció/)).toBeInTheDocument();
  });

  it("pontos megerősítésig tiltja a létrehozást", async () => {
    render(<AdminDemoAuctionsPage />); await screen.findByRole("heading", { name: "Aktuális állapot" });
    fireEvent.click(screen.getByRole("button", { name: "Demóaukciók létrehozása" }));
    const input = screen.getByLabelText("Megerősítő szöveg");
    expect(input).toHaveFocus();
    const confirm = screen.getByRole("button", { name: "Megerősítés" });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "DEMO AUKCIÓK LÉTREHOZÁSA" } });
    expect(confirm).toBeEnabled(); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.createDemoAuctions).toHaveBeenCalledWith(80, 20, "DEMO AUKCIÓK LÉTREHOZÁSA"));
  });
});
