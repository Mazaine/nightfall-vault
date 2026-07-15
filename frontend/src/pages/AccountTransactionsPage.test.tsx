import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountTransactionsPage } from "./AccountTransactionsPage";

const mocks = vi.hoisted(() => ({ listTransactions: vi.fn(), confirmTransactionCompletion: vi.fn() }));
vi.mock("../api/transactions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/transactions")>()), ...mocks }));

const transaction = { id: 1, auction_id: 42, status: "transaction_open" as const, seller_completed_at: null, buyer_completed_at: null, completed_at: null, review_deadline: null, archived_at: null, created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", role: "buyer" as const, own_completed_at: null, partner_completed_at: null, can_confirm: true, can_review: false, auction: { id: 42, title: "Ritka kártya", finalized_at: "2026-07-15T10:00:00Z" }, partner: { username: "elado", full_name: "Teszt Eladó" } };

describe("AccountTransactionsPage", () => {
  beforeEach(() => { mocks.listTransactions.mockReset().mockResolvedValue({ items: [transaction], total: 1, limit: 20, offset: 0 }); mocks.confirmTransactionCompletion.mockReset().mockResolvedValue({ ...transaction, own_completed_at: "2026-07-15T11:00:00Z", can_confirm: false }); vi.spyOn(window, "confirm").mockReturnValue(true); });
  it("magyar státuszt, partnert és jogosult megerősítést mutat", async () => {
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    expect(await screen.findByText("Ritka kártya")).toBeInTheDocument();
    expect(screen.getAllByText("Egyeztetés folyamatban")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "elado" })).toHaveAttribute("href", "/users/elado");
    fireEvent.click(screen.getByRole("button", { name: "Teljesítés megerősítése" }));
    await waitFor(() => expect(mocks.confirmTransactionCompletion).toHaveBeenCalledWith(1));
  });
  it("nem jelenít meg értékelési CTA-t jogosultság nélkül", async () => {
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    await screen.findByText("Ritka kártya");
    expect(screen.queryByRole("link", { name: "Értékelés" })).not.toBeInTheDocument();
  });
});
