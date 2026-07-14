import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountTransactionsPage } from "./AccountTransactionsPage";

const mocks = vi.hoisted(() => ({
  listMyTransactions: vi.fn(),
  confirmTransaction: vi.fn(),
  openTransactionDispute: vi.fn(),
}));

vi.mock("../api/transactions", () => mocks);

const transaction = {
  id: 8,
  auction_id: 42,
  auction_title: "Megnyert gyűjtői kártya",
  auction_image_key: null,
  amount: "12500.00",
  status: "awaiting_arrangement" as const,
  role: "buyer" as const,
  counterparty: { username: "elado", full_name: "Teszt Eladó" },
  seller_confirmed: false,
  buyer_confirmed: false,
  can_confirm: true,
  can_dispute: true,
  dispute_reason: null,
  created_at: "2026-07-13T10:00:00Z",
  updated_at: "2026-07-13T10:00:00Z",
  completed_at: null,
};

describe("AccountTransactionsPage", () => {
  beforeEach(() => {
    mocks.listMyTransactions.mockReset().mockResolvedValue([transaction]);
    mocks.confirmTransaction.mockReset().mockResolvedValue({ ...transaction, buyer_confirmed: true });
    mocks.openTransactionDispute.mockReset();
  });

  it("megjeleníti a résztvevő tranzakcióját és visszaigazolja az átvételt", async () => {
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);

    expect(await screen.findByText("Megnyert gyűjtői kártya")).toBeInTheDocument();
    expect(screen.getByText("12 500 Ft")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Átvételt visszaigazolom" }));

    await waitFor(() => expect(mocks.confirmTransaction).toHaveBeenCalledWith(8));
  });
});
