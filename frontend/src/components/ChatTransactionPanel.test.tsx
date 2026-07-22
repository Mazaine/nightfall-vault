import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatTransactionPanel } from "./ChatTransactionPanel";

const state = vi.hoisted(() => ({ listener: null as ((event: { type: string; payload: Record<string, unknown> }) => void) | null }));
const mocks = vi.hoisted(() => ({ listTransactions: vi.fn(), confirmTransactionCompletion: vi.fn() }));
vi.mock("../NotificationContext", () => ({ useNotifications: () => ({ subscribe: (listener: typeof state.listener) => { state.listener = listener; return () => { state.listener = null; }; } }) }));
vi.mock("../api/transactions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/transactions")>()), ...mocks }));

const transaction = {
  id: 4, auction_id: 81, status: "transaction_open" as const, seller_completed_at: null, buyer_completed_at: null,
  completed_at: null, review_deadline: null, archived_at: null, created_at: "2026-07-20T10:00:00Z", updated_at: "2026-07-20T10:00:00Z",
  role: "buyer" as const, own_completed_at: null, partner_completed_at: "2026-07-20T11:00:00Z", can_confirm: true, can_review: false,
  auction: { id: 81, title: "Teszt aukció", finalized_at: "2026-07-20T10:00:00Z" }, partner: { username: "elado", full_name: "Teszt Eladó" },
};

describe("ChatTransactionPanel", () => {
  beforeEach(() => {
    state.listener = null;
    mocks.listTransactions.mockReset().mockResolvedValue({ items: [transaction], total: 1, limit: 100, offset: 0 });
    mocks.confirmTransactionCompletion.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("a chatben mutatja a két fél állapotát és completed után értékelést kér", async () => {
    const reviewReady = vi.fn();
    window.addEventListener("nightfall:review-ready", reviewReady);
    mocks.confirmTransactionCompletion.mockResolvedValue({ ...transaction, status: "completed", own_completed_at: "2026-07-20T12:00:00Z", completed_at: "2026-07-20T12:00:00Z", review_deadline: "2026-08-19T12:00:00Z", can_confirm: false, can_review: true });
    render(<ChatTransactionPanel auctionId={81} />);

    expect(await screen.findByText("Saját megerősítés: hiányzik · Partner: kész")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Teljesítés megerősítése" }));

    await waitFor(() => expect(mocks.confirmTransactionCompletion).toHaveBeenCalledWith(4));
    expect(reviewReady).toHaveBeenCalledOnce();
    expect(screen.getByText("Tranzakció teljesítve")).toBeInTheDocument();
    window.removeEventListener("nightfall:review-ready", reviewReady);
  });
});
