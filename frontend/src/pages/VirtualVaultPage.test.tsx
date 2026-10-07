import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualVaultPage } from "./VirtualVaultPage";

const mocks = vi.hoisted(() => Object.fromEntries([
  "getVaultSummary", "listVaultCards", "listTradeCards", "listNegotiations", "getPointHistory", "listCardLoans", "listDecks", "listHkkEditions",
  "searchHkk", "createVaultFolder", "deleteVaultFolder", "addVaultCard", "addWantedCard", "addTradeCard", "setVaultWanted", "previewHkkEdition", "importHkkEdition",
  "updateVaultCard", "deleteVaultCard", "buyVaultCapacity", "postTradeMessage", "listMatchingOffers", "expressTradeInterest", "createCardLoan", "returnCardLoan",
  "listTradeCardSeekers", "createDeck", "deleteDeck", "addDeckCard", "updateDeckCard", "deleteDeckCard", "listDeckCardOffers",
].map((name) => [name, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>);
vi.mock("../api/vault", () => mocks);

const summary = {
  total_collection_capacity: 1000, assigned_collection_capacity: 200, free_collection_capacity: 800, used_collection_slots: 1,
  trade_capacity: 200, used_trade_slots: 1, vp_balance: 120, vault_unlimited: false, owned_card_quantity: 2,
  new_trade_opportunities: 1, cards_wanted_by_others: 1, deck_missing_quantity: 2, active_loan_count: 1,
  folders: [{ id: 1, name: "Xenó", capacity: 200, position: 0, color: "#7c3aed", used_slots: 1 }],
};
const card = { id: 5, external_card_id: "101", card_name: "Xenó lárva", image_url: null, edition: "Teszt", card_type: "Lény", subtype: null, color: null, rarity: "rare", quantity: 2, folder_id: 1, wanted: true, wanted_quantity: 1, offer_count: 1, print_variant: "normal" };
const hkk = { external_card_id: "202", card_name: "Orkling", image_url: null, edition: "Álomháború", card_type: "Lény", subtype: null, color: null, rarity: "rare", source_token: "signed-snapshot-token-that-is-long-enough" };

describe("VirtualVaultPage", () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear();
    mocks.getVaultSummary.mockResolvedValue(summary); mocks.listVaultCards.mockResolvedValue([card]);
    mocks.listTradeCards.mockResolvedValue([{ ...card, owner_id: 1, owner_username: "admin", seeker_count: 1 }]);
    mocks.listNegotiations.mockResolvedValue([]); mocks.getPointHistory.mockResolvedValue({ balance: 120, items: [] });
    mocks.listCardLoans.mockResolvedValue([]); mocks.listDecks.mockResolvedValue([]);
    mocks.listHkkEditions.mockResolvedValue([{ id: "220", name: "Álomháború" }]);
  });

  it("valós számlálókkal induló, kattintható áttekintőt és négy fő területet mutat", async () => {
    render(<VirtualVaultPage />);
    expect(await screen.findByText("Mi történt a mappádban?")).toBeInTheDocument();
    expect(screen.getByText("Összes saját lap").closest("button")).toHaveTextContent("2");
    expect(screen.getByRole("navigation", { name: "Virtuális mappa területei" }).querySelectorAll("button")).toHaveLength(4);
    fireEvent.click(screen.getByText("Paklikból hiányzik").closest("button")!);
    expect(await screen.findByRole("heading", { name: "Paklik & verseny" })).toBeInTheDocument();
  });

  it("a kereshető kiegészítő-comboboxzal üres lapnév mellett is keres", async () => {
    mocks.searchHkk.mockResolvedValue([hkk]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?");
    fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const combo = screen.getAllByRole("combobox")[0];
    fireEvent.change(combo, { target: { value: "220" } }); fireEvent.keyDown(combo, { key: "ArrowDown" }); fireEvent.keyDown(combo, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    await waitFor(() => expect(mocks.searchHkk).toHaveBeenCalledWith("", "220"));
    expect(await screen.findByText("Orkling")).toBeInTheDocument();
  });

  it("mappát egyetlen Nightfall modalban, pontos névvel enged törölni", async () => {
    mocks.deleteVaultFolder.mockResolvedValue(undefined);
    const prompt = vi.spyOn(window, "prompt");
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    fireEvent.click(await screen.findByRole("button", { name: "Xenó törlése" }));
    const dialog = screen.getByRole("dialog", { name: "Almappa végleges törlése" });
    const danger = within(dialog).getByRole("button", { name: "Mappa és 1 lap törlése" });
    expect(danger).toBeDisabled(); fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Xenó" } }); expect(danger).toBeEnabled(); fireEvent.click(danger);
    await waitFor(() => expect(mocks.deleteVaultFolder).toHaveBeenCalledWith(1, { deleteContents: true }));
    expect(prompt).not.toHaveBeenCalled();
  });

  it("kölcsönadást natív prompt nélkül, validált űrlapon rögzít", async () => {
    mocks.createCardLoan.mockResolvedValue({}); const prompt = vi.spyOn(window, "prompt");
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const article = (await screen.findByText("Xenó lárva")).closest("article")!; fireEvent.click(within(article).getByText("További műveletek")); fireEvent.click(within(article).getByRole("button", { name: "Kölcsönadom" }));
    const dialog = screen.getByRole("dialog"); fireEvent.change(within(dialog).getByLabelText("Kölcsönvevő neve"), { target: { value: "Béla" } }); fireEvent.click(within(dialog).getByRole("button", { name: "Kölcsönadás mentése" }));
    await waitFor(() => expect(mocks.createCardLoan).toHaveBeenCalledWith(5, expect.objectContaining({ borrower_name: "Béla", quantity: 1 })));
    expect(prompt).not.toHaveBeenCalled();
  });

  it("a cserelap keresőit csak kontextusban, publikus adatokkal mutatja", async () => {
    mocks.listTradeCardSeekers.mockResolvedValue([{ user_id: 9, username: "jatek", display_name: "Játékos", wanted_quantity: 2 }]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Csere" }));
    fireEvent.click(await screen.findByRole("button", { name: /Ki keresi ezt a lapot/ }));
    expect(await screen.findByText("Játékos")).toBeInTheDocument(); expect(screen.getByText(/@jatek/)).toBeInTheDocument();
    expect(mocks.listTradeCardSeekers).toHaveBeenCalledWith(5);
  });

  it("paklit létrehoz, HKK találatot szükséges mennyiséggel hozzáad", async () => {
    const deck = { id: 3, name: "Versenypakli", total_required_quantity: 0, owned_quantity: 0, missing_quantity: 0, available_trade_quantity: 0, cards: [] };
    mocks.createDeck.mockResolvedValue(deck); mocks.listDecks.mockResolvedValueOnce([]).mockResolvedValue([deck]); mocks.searchHkk.mockResolvedValue([hkk]); mocks.addDeckCard.mockResolvedValue(deck);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Paklik & verseny" }));
    fireEvent.change(screen.getByPlaceholderText("Új pakli neve"), { target: { value: "Versenypakli" } }); fireEvent.click(screen.getByRole("button", { name: "Létrehozás" }));
    await waitFor(() => expect(mocks.createDeck).toHaveBeenCalledWith("Versenypakli"));
    fireEvent.change(await screen.findByLabelText("Paklilap keresése"), { target: { value: "Orkling" } }); fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    fireEvent.change(await screen.findByLabelText("Orkling szükséges mennyisége"), { target: { value: "3" } }); fireEvent.click(screen.getByRole("button", { name: "Pakliba" }));
    await waitFor(() => expect(mocks.addDeckCard).toHaveBeenCalledWith(3, hkk, 3));
  });

  it("a ritkább gyűjteményi szűrőket fokozatosan tárja fel", async () => {
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    expect(await screen.findByText("Xenó lárva")).toBeInTheDocument(); expect(screen.queryByText("Gyakoriság", { selector: "label" })).not.toBeVisible();
    fireEvent.click(screen.getByText("Szűrők")); expect(screen.getByText("Gyakoriság", { selector: "label" })).toBeVisible();
  });

  it("a verseny-checklist a hiányokat, keresletet és kölcsönt egy helyre vonja", async () => {
    mocks.listCardLoans.mockResolvedValue([{ id: 7, collection_card_id: 5, external_card_id: "101", card_name: "Xenó lárva", print_variant: "normal", quantity: 1, borrower_name: "Béla", borrower_user_id: null, lent_at: "2026-10-01", due_at: null, note: null, status: "active", returned_at: null, created_at: "2026-10-01" }]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Paklik & verseny" }));
    expect(await screen.findByRole("heading", { name: "Versenylista készítése" })).toBeInTheDocument();
    expect(screen.getByText("Keresem / hiányzik")).toBeInTheDocument(); expect(screen.getByText("Mások keresik")).toBeInTheDocument(); expect(screen.getByText("Kölcsön")).toBeInTheDocument();
  });
});
