import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionConversationPage } from "./TransactionConversationPage";

const mocks = vi.hoisted(() => ({ getTransactionConversation: vi.fn(), createTransactionConversationMessage: vi.fn() }));
vi.mock("../api/transactions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/transactions")>()), ...mocks }));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ user: { id: 2 } }) }));
vi.mock("../NotificationContext", () => ({ useNotifications: () => ({ subscribe: () => () => undefined }) }));

const conversation = {
  id: 7,
  role: "buyer" as const,
  partner: { username: "elado", full_name: "Teszt Eladó" },
  item_count: 3,
  total: 2450,
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  transactions: [
    { id: 1, conversation_id: 7, auction_id: 41, status: "transaction_open" as const, seller_completed_at: null, buyer_completed_at: null, completed_at: null, review_deadline: null, archived_at: null, created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:00:00Z", role: "buyer" as const, own_completed_at: null, partner_completed_at: null, can_confirm: true, can_review: false, own_note: null, can_delete: false, auction: { id: 41, title: "Első lap", finalized_at: null }, partner: { username: "elado", full_name: "Teszt Eladó" }, items: [{ id: 1, auction_id: 41, title: "Első lap", quantity: 2, unit_price: 500, subtotal: 1000 }], total: 1000 },
    { id: 2, conversation_id: 7, auction_id: 42, status: "transaction_open" as const, seller_completed_at: null, buyer_completed_at: null, completed_at: null, review_deadline: null, archived_at: null, created_at: "2026-11-10T11:00:00Z", updated_at: "2026-11-10T11:00:00Z", role: "buyer" as const, own_completed_at: null, partner_completed_at: null, can_confirm: true, can_review: false, own_note: null, can_delete: false, auction: { id: 42, title: "Második lap", finalized_at: null }, partner: { username: "elado", full_name: "Teszt Eladó" }, items: [{ id: 2, auction_id: 42, title: "Második lap", quantity: 1, unit_price: 1450, subtotal: 1450 }], total: 1450 },
  ],
  messages: [
    { id: 10, source: "legacy" as const, conversation_id: 7, auction_id: 41, auction_title: "Első lap", sender_id: 1, sender: { username: "elado", full_name: "Teszt Eladó" }, message: "Régi hirdetésüzenet", created_at: "2026-11-10T10:10:00Z", read_at: null },
    { id: 1, source: "common" as const, conversation_id: 7, auction_id: null, auction_title: null, sender_id: 2, sender: { username: "vevo", full_name: "Teszt Vevő" }, message: "Közös üzenet", created_at: "2026-11-10T11:10:00Z", read_at: null },
  ],
};

describe("TransactionConversationPage", () => {
  beforeEach(() => {
    mocks.getTransactionConversation.mockReset().mockResolvedValue(conversation);
    mocks.createTransactionConversationMessage.mockReset().mockResolvedValue({ ...conversation, messages: [...conversation.messages, { ...conversation.messages[1], id: 2, message: "Új közös üzenet" }] });
  });

  it("egy helyen mutatja a partner ügyleteit, elszámolását és a régi üzeneteket", async () => {
    render(<MemoryRouter initialEntries={["/account/transactions/conversations/7"]}><Routes><Route path="/account/transactions/conversations/:conversationId" element={<TransactionConversationPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Közös egyeztetés" })).toBeInTheDocument();
    expect(screen.getByText(/2 ügylet · 3 db/)).toBeInTheDocument();
    expect(screen.getByText("Régi hirdetésüzenet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Korábbi hirdetés: Első lap" })).toHaveAttribute("href", "/auctions/41#auction-conversation");
    expect(screen.getByText("Közös üzenet")).toBeInTheDocument();
  });

  it("az új üzenetet a közös beszélgetés API-ján küldi", async () => {
    render(<MemoryRouter initialEntries={["/account/transactions/conversations/7"]}><Routes><Route path="/account/transactions/conversations/:conversationId" element={<TransactionConversationPage />} /></Routes></MemoryRouter>);
    const input = await screen.findByLabelText("Üzenet a partnernek");
    fireEvent.change(input, { target: { value: "Új közös üzenet" } });
    fireEvent.click(screen.getByRole("button", { name: "Küldés" }));
    await waitFor(() => expect(mocks.createTransactionConversationMessage).toHaveBeenCalledWith(7, "Új közös üzenet"));
    expect(await screen.findByText("Új közös üzenet")).toBeInTheDocument();
  });
});
