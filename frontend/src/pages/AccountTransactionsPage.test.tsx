import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountTransactionsPage } from "./AccountTransactionsPage";

const mocks = vi.hoisted(() => ({ listTransactions: vi.fn(), confirmTransactionCompletion: vi.fn(), saveTransactionNote: vi.fn(), deleteClosedTransaction: vi.fn() }));
vi.mock("../api/transactions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/transactions")>()), ...mocks }));

const transaction = { id: 1, auction_id: 42, conversation_id: 7, status: "transaction_open" as const, seller_completed_at: null, buyer_completed_at: null, completed_at: null, review_deadline: null, archived_at: null, created_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z", role: "buyer" as const, own_completed_at: null, partner_completed_at: null, can_confirm: true, can_review: false, own_note: null, can_delete: false, auction: { id: 42, title: "Ritka kártya", finalized_at: "2026-07-15T10:00:00Z" }, partner: { username: "elado", full_name: "Teszt Eladó" } };

describe("AccountTransactionsPage", () => {
  beforeEach(() => {
    mocks.listTransactions.mockReset().mockResolvedValue({ items: [transaction], total: 1, limit: 20, offset: 0 });
    mocks.confirmTransactionCompletion.mockReset().mockResolvedValue({ ...transaction, own_completed_at: "2026-07-15T11:00:00Z", can_confirm: false });
    mocks.saveTransactionNote.mockReset().mockImplementation(async (_id: number, note: string) => ({ ...transaction, own_note: note }));
    mocks.deleteClosedTransaction.mockReset().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("magyar státuszt, partnert és jogosult megerősítést mutat", async () => {
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    expect(await screen.findByText("Ritka kártya")).toBeInTheDocument();
    expect(screen.getAllByText("Egyeztetés folyamatban")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "elado" })).toHaveAttribute("href", "/users/elado");
    expect(screen.getByRole("link", { name: "Chat megnyitása" })).toHaveAttribute("href", "/auctions/42#auction-conversation");
    fireEvent.click(screen.getByRole("button", { name: "Teljesítés megerősítése" }));
    await waitFor(() => expect(mocks.confirmTransactionCompletion).toHaveBeenCalledWith(1));
  });

  it("nem jelenít meg értékelési CTA-t jogosultság nélkül", async () => {
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    await screen.findByText("Ritka kártya");
    expect(screen.queryByRole("link", { name: "Értékelés" })).not.toBeInTheDocument();
  });

  it("megjeleníti a teljesített tranzakció értékelési határidejét", async () => {
    mocks.listTransactions.mockResolvedValue({
      items: [{ ...transaction, status: "completed", completed_at: "2026-07-16T10:00:00Z", review_deadline: "2026-08-15T10:00:00Z", can_confirm: false, can_review: true, can_delete: true }],
      total: 1,
      limit: 20,
      offset: 0,
    });
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    expect(await screen.findByText("Értékelési határidő")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Értékelés" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tranzakció törlése" })).toBeInTheDocument();
  });

  it("minden tranzakcióhoz saját megjegyzést ment", async () => {
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    const note = await screen.findByLabelText("Saját megjegyzés");
    fireEvent.change(note, { target: { value: "Személyes emlékeztető" } });
    fireEvent.click(screen.getByRole("button", { name: "Megjegyzés mentése" }));
    await waitFor(() => expect(mocks.saveTransactionNote).toHaveBeenCalledWith(1, "Személyes emlékeztető"));
  });

  it("azonos partner több vásárlását mennyiséggel és rögzített összeggel összesíti", async () => {
    const purchase = (id: number, auctionId: number, title: string, quantity: number, unitPrice: string) => ({
      ...transaction,
      id,
      auction_id: auctionId,
      auction: { ...transaction.auction, id: auctionId, title },
      items: [{ id, auction_id: auctionId, title, quantity, unit_price: unitPrice, subtotal: String(quantity * Number(unitPrice)) }],
      total: String(quantity * Number(unitPrice)),
    });
    mocks.listTransactions.mockResolvedValue({
      items: [purchase(1, 41, "A lap", 3, "150"), purchase(2, 42, "B lap", 2, "400"), purchase(3, 43, "C lap", 1, "1200")],
      total: 3,
      limit: 100,
      offset: 0,
    });
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    expect(await screen.findByText(/3 vásárlás · 6 lap · 2\s?450 Ft/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Közös egyeztetés" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Közös egyeztetés" })).toHaveAttribute("href", "/account/transactions/conversations/7");
  });

  it("külön partnercsoportban tartja a különböző eladók vásárlásait", async () => {
    mocks.listTransactions.mockResolvedValue({
      items: [transaction, { ...transaction, id: 2, auction_id: 43, conversation_id: 8, partner: { username: "masik-elado", full_name: "Másik Eladó" }, auction: { ...transaction.auction, id: 43, title: "Másik lap" } }],
      total: 2,
      limit: 100,
      offset: 0,
    });
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "elado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "masik-elado" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Közös egyeztetés" })).toHaveLength(2);
  });

  it("lezárt tranzakciót csak megerősítés után távolít el a saját listából", async () => {
    mocks.listTransactions.mockResolvedValue({ items: [{ ...transaction, status: "archived", can_confirm: false, can_delete: true }], total: 1, limit: 20, offset: 0 });
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    const button = await screen.findByRole("button", { name: "Tranzakció törlése" });
    fireEvent.click(button);
    expect(mocks.deleteClosedTransaction).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.deleteClosedTransaction).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Ritka kártya")).not.toBeInTheDocument());
  });

  it("érthető üresállapotot jelenít meg", async () => {
    mocks.listTransactions.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Még nincs tranzakciód" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aukciók böngészése" })).toBeInTheDocument();
  });

  it("hiba után működő újrapróbálást biztosít", async () => {
    mocks.listTransactions.mockRejectedValueOnce(new Error("Átmeneti betöltési hiba")).mockResolvedValueOnce({ items: [], total: 0, limit: 20, offset: 0 });
    render(<MemoryRouter><AccountTransactionsPage /></MemoryRouter>);
    expect(await screen.findByText("Átmeneti betöltési hiba")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Újrapróbálás" }));
    expect(await screen.findByRole("heading", { name: "Még nincs tranzakciód" })).toBeInTheDocument();
  });
});
