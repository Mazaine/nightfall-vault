import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualVaultPage } from "./VirtualVaultPage";

const mocks = vi.hoisted(() => ({
  getVaultSummary: vi.fn(), listVaultCards: vi.fn(), listTradeCards: vi.fn(), listNegotiations: vi.fn(), getPointHistory: vi.fn(),
  searchHkk: vi.fn(), createVaultFolder: vi.fn(), addVaultCard: vi.fn(), addWantedCard: vi.fn(), addTradeCard: vi.fn(), setVaultWanted: vi.fn(),
  listHkkEditions: vi.fn(), previewHkkEdition: vi.fn(), importHkkEdition: vi.fn(),
  updateVaultCard: vi.fn(), deleteVaultCard: vi.fn(), deleteTradeCard: vi.fn(), buyVaultCapacity: vi.fn(), postTradeMessage: vi.fn(), confirmVaultTrade: vi.fn(), reviewVaultTrade: vi.fn(),
}));
vi.mock("../api/vault", () => mocks);

const summary = { total_collection_capacity: 1000, assigned_collection_capacity: 200, free_collection_capacity: 800, used_collection_slots: 1, trade_capacity: 200, used_trade_slots: 0, vp_balance: 120, folders: [{ id: 1, name: "Xenó", capacity: 200, position: 0, color: "#7c3aed", used_slots: 1 }] };
const card = { id: 5, external_card_id: "hkk-1", card_name: "Xenó lárva", image_url: null, edition: "Teszt", card_type: "Lény", subtype: null, color: null, rarity: null, quantity: 2, folder_id: 1, wanted: false, wanted_quantity: 0, offer_count: 7 };

describe("VirtualVaultPage", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getVaultSummary.mockResolvedValue(summary); mocks.listVaultCards.mockResolvedValue([card]); mocks.listTradeCards.mockResolvedValue([]); mocks.listNegotiations.mockResolvedValue([]); mocks.getPointHistory.mockResolvedValue({ balance: 120, items: [] });
  });

  it("mobilon is kártyás gyűjteményt, playsetet és Keresem műveletet ad", async () => {
    render(<VirtualVaultPage />);
    expect(await screen.findByRole("heading", { name: "Virtuális HKK Mappa" })).toBeInTheDocument();
    expect(await screen.findByText("Xenó lárva")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    mocks.setVaultWanted.mockResolvedValue({ ...card, wanted: true, wanted_quantity: 1 });
    fireEvent.click(within(screen.getByText("Xenó lárva").closest("article")!).getByRole("button", { name: "Keresem" }));
    await waitFor(() => expect(mocks.setVaultWanted).toHaveBeenCalledWith(5, true, 1));
  });

  it("a keresési találatot meglévő példány nélkül is közvetlenül a Keresem listára teszi", async () => {
    const result = { external_card_id: "41234", card_name: "Orkling bűzisten", image_url: null, edition: "Álomháború", card_type: "Avatár", subtype: "orkling", color: "Chara-din", rarity: "rare", source_token: "signed-snapshot" };
    mocks.searchHkk.mockResolvedValue([result]);
    mocks.addWantedCard.mockResolvedValue({ ...result, id: 9, folder_id: 1, quantity: 0, wanted: true, wanted_quantity: 3, offer_count: 0 });
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");

    fireEvent.change(screen.getByPlaceholderText("Keresés lapnévre…"), { target: { value: "orkling" } });
    fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    const resultCard = (await screen.findByText("Orkling bűzisten")).closest("article")!;
    fireEvent.click(within(resultCard).getByRole("button", { name: "Keresem" }));

    await waitFor(() => expect(mocks.addWantedCard).toHaveBeenCalledWith(result, 1));
    fireEvent.click(screen.getByRole("button", { name: "Találatok törlése" }));
    expect(screen.queryByText("Orkling bűzisten")).not.toBeInTheDocument();
  });

  it("a Cseremappa nézetben nem jeleníti meg a lapkeresőt", async () => {
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "Cseremappa" }));
    expect(screen.queryByRole("heading", { name: "HKK lapfelvitel" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Keresés lapnévre…")).not.toBeInTheDocument();
  });

  it("az egyeztetésben publikus felhasználóneveket mutat e-mail-cím helyett", async () => {
    mocks.listNegotiations.mockResolvedValue([{ id: 12, requester_id: 1, requester_username: "admin", requester_display_name: "admin", owner_id: 2, owner_username: "omronraktar@gmail.com", owner_display_name: "omronraktar", status: "open", requester_confirmed_at: null, owner_confirmed_at: null, completed_at: null, card: { ...card, card_name: "Az élet teremtése (2026)" }, messages: [{ id: 3, sender_id: 2, sender_username: "omronraktar@gmail.com", sender_display_name: "omronraktar", message: "szia", created_at: "2026-10-04T14:00:00Z" }] }]);
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "Match-ek" }));

    expect(await screen.findByText("@admin ↔ @omronraktar · egyeztetés")).toBeInTheDocument();
    expect(screen.getByText("@omronraktar")).toBeInTheDocument();
    expect(screen.queryByText(/omronraktar@gmail\.com/)).not.toBeInTheDocument();
  });

  it("megjeleníti a kapacitást és engedi a fix árú bővítést", async () => {
    mocks.buyVaultCapacity.mockResolvedValue({ ...summary, total_collection_capacity: 1050, vp_balance: 20 });
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "VP / kapacitás" }));
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hogyan szerezhetsz VP-t?" })).toBeInTheDocument();
    for (const reward of ["+15 VP", "+20 VP", "+10 VP", "+5 VP"]) expect(screen.getByText(reward)).toBeInTheDocument();
    expect(screen.getByText(/100 VP = \+50 permanens gyűjtőzseb/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Feloldás 100 VP-ért" }));
    await waitFor(() => expect(mocks.buyVaultCapacity).toHaveBeenCalledTimes(1));
  });

  it("desktopon és mobilon elérhető kiegészítő importot ad", async () => {
    mocks.listHkkEditions.mockResolvedValue([{ id: "220", name: "Résföld" }]);
    mocks.previewHkkEdition.mockResolvedValue({ edition: { id: "220", name: "Résföld" }, count: 87, cards: [] });
    mocks.importHkkEdition.mockResolvedValue({ edition: { id: "220", name: "Résföld" }, total_cards: 87, added_cards: 87, updated_cards: 0, skipped_cards: 0 });
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("tab", { name: "Kiegészítő hozzáadása" }));
    await waitFor(() => expect(mocks.listHkkEditions).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Kiegészítő"), { target: { value: "220" } });
    expect(await screen.findByText("87")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Alapértelmezett darabszám"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Teljes kiegészítő hozzáadása" }));
    await waitFor(() => expect(mocks.importHkkEdition).toHaveBeenCalledWith({ edition_id: "220", folder_id: 1, quantity: 3, missing_only: false }));
  });

  it("korlátlan accountnál végtelen kapacitást mutat és elrejti a vásárlást", async () => {
    mocks.getVaultSummary.mockResolvedValue({ ...summary, vault_unlimited: true });
    render(<VirtualVaultPage />);
    expect(await screen.findByText("∞ Korlátlan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "VP / kapacitás" }));
    expect(screen.getByText("Korlátlan Virtuális Mappa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Feloldás 100 VP-ért" })).not.toBeInTheDocument();
  });

  it("metaadat szerint rendezi a mappát és magyarítja a gyakoriságot", async () => {
    mocks.listVaultCards.mockResolvedValue([
      { ...card, id: 6, external_card_id: "20", card_name: "Ritka lap", edition: "Roxat céhei", card_type: "Szörny", subtype: "féreg", color: "Fairlight · Nincs", rarity: "rare" },
      { ...card, id: 7, external_card_id: "3", card_name: "Gyakori lap", rarity: "common" },
      { ...card, id: 8, external_card_id: "11", card_name: "Nem gyakori lap", rarity: "uncommun" },
    ]);
    const { container } = render(<VirtualVaultPage />);
    expect(await screen.findByText(/rare – Ritka$/)).toBeInTheDocument();
    expect(screen.getByText(/common – Gyakori$/)).toBeInTheDocument();
    expect(screen.getByText(/uncommun – Nem gyakori$/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mappa rendezése"), { target: { value: "external_card_id" } });
    const names = Array.from(container.querySelectorAll(".vault-card-grid .vault-card .vault-card-body > div:first-child > strong")).map((node) => node.textContent);
    expect(names).toEqual(["Gyakori lap", "Nem gyakori lap", "Ritka lap"]);
  });
});
