import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualVaultPage } from "./VirtualVaultPage";

const mocks = vi.hoisted(() => ({
  getVaultSummary: vi.fn(), listVaultCards: vi.fn(), listTradeCards: vi.fn(), listNegotiations: vi.fn(), getPointHistory: vi.fn(),
  searchHkk: vi.fn(), createVaultFolder: vi.fn(), updateVaultFolder: vi.fn(), deleteVaultFolder: vi.fn(), reorderVaultFolders: vi.fn(), addVaultCard: vi.fn(), addWantedCard: vi.fn(), addTradeCard: vi.fn(), setVaultWanted: vi.fn(),
  listHkkEditions: vi.fn(), previewHkkEdition: vi.fn(), importHkkEdition: vi.fn(),
  updateVaultCard: vi.fn(), updateTradeCard: vi.fn(), deleteVaultCard: vi.fn(), deleteTradeCard: vi.fn(), buyVaultCapacity: vi.fn(), postTradeMessage: vi.fn(), confirmVaultTrade: vi.fn(), reviewVaultTrade: vi.fn(),
  listCardLoans: vi.fn(), createCardLoan: vi.fn(), returnCardLoan: vi.fn(), listMatchingOffers: vi.fn(), expressTradeInterest: vi.fn(),
}));
vi.mock("../api/vault", () => mocks);

const summary = { total_collection_capacity: 1000, assigned_collection_capacity: 200, free_collection_capacity: 800, used_collection_slots: 1, trade_capacity: 200, used_trade_slots: 0, vp_balance: 120, folders: [{ id: 1, name: "Xenó", capacity: 200, position: 0, color: "#7c3aed", used_slots: 1 }] };
const card = { id: 5, external_card_id: "hkk-1", card_name: "Xenó lárva", image_url: null, edition: "Teszt", card_type: "Lény", subtype: null, color: null, rarity: null, quantity: 2, folder_id: 1, wanted: false, wanted_quantity: 0, offer_count: 7, print_variant: "normal" };

describe("VirtualVaultPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear(); mocks.getVaultSummary.mockResolvedValue(summary); mocks.listVaultCards.mockResolvedValue([card]); mocks.listTradeCards.mockResolvedValue([]); mocks.listNegotiations.mockResolvedValue([]); mocks.getPointHistory.mockResolvedValue({ balance: 120, items: [] }); mocks.listHkkEditions.mockResolvedValue([]); mocks.listCardLoans.mockResolvedValue([]);
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

  it("a nulla példányszámot a mappában tartja", async () => {
    mocks.updateVaultCard.mockResolvedValue({ ...card, quantity: 0 });
    render(<VirtualVaultPage />);
    const cardArticle = (await screen.findByText("Xenó lárva")).closest("article")!;
    fireEvent.change(within(cardArticle).getByLabelText("Példányszám"), { target: { value: "0" } });
    await waitFor(() => expect(mocks.updateVaultCard).toHaveBeenCalledWith(5, { quantity: 0 }));
  });

  it("Foil, FA és GFA változatot jelölhet a gyűjteményben és a cseremappában", async () => {
    mocks.listTradeCards.mockResolvedValue([{ ...card, owner_id: 1, owner_username: "admin", print_variant: "foil" }]);
    mocks.updateVaultCard.mockResolvedValue({ ...card, print_variant: "gfa" });
    mocks.updateTradeCard.mockResolvedValue({ ...card, print_variant: "fa" });
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.change(screen.getByLabelText("Xenó lárva változata"), { target: { value: "gfa" } });
    await waitFor(() => expect(mocks.updateVaultCard).toHaveBeenCalledWith(5, { print_variant: "gfa" }));
    fireEvent.click(screen.getByRole("button", { name: "Cseremappa" }));
    fireEvent.change(screen.getByLabelText("Xenó lárva cserelap változata"), { target: { value: "fa" } });
    await waitFor(() => expect(mocks.updateTradeCard).toHaveBeenCalledWith(5, { quantity: 2, print_variant: "fa" }));
  });

  it("az új mappát azonnal megjeleníti és kiválasztja", async () => {
    mocks.createVaultFolder.mockResolvedValue({ id: 2, name: "Új mappa", capacity: 25, position: 1, color: "#7c3aed", used_slots: 0 });
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.change(screen.getByPlaceholderText("Mappa neve"), { target: { value: "Új mappa" } });
    fireEvent.change(screen.getByPlaceholderText("Zsebek"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Létrehozás" }));
    expect(await screen.findByText("Új mappa létrehozva.")).toBeInTheDocument();
    expect(screen.getByText("Új mappa", { selector: ".vault-folder span" }).closest("button")).toHaveClass("is-active");
  });

  it("nem üres mappát célmappába mozgatva töröl", async () => {
    const archive = { id: 2, name: "Archívum", capacity: 50, position: 1, color: "#6d28d9", used_slots: 0 };
    mocks.getVaultSummary.mockResolvedValue({ ...summary, assigned_collection_capacity: 250, free_collection_capacity: 750, folders: [...summary.folders, archive] });
    mocks.deleteVaultFolder.mockResolvedValue(undefined);
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Archívum");
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "Xenó törlése" }));
    expect(await screen.findByRole("dialog", { name: "Almappa törlése" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lapok áthelyezése és mappa törlése" }));
    await waitFor(() => expect(mocks.deleteVaultFolder).toHaveBeenCalledWith(1, { moveToFolderId: 2, deleteContents: false }));
    expect(screen.queryByRole("button", { name: "Xenó törlése" })).not.toBeInTheDocument();
    prompt.mockRestore();
  });

  it("a keresési találatot meglévő példány nélkül is közvetlenül a Keresem listára teszi", async () => {
    const result = { external_card_id: "41234", card_name: "Orkling bűzisten", image_url: null, edition: "Álomháború", card_type: "Avatár", subtype: "orkling", color: "Chara-din", rarity: "rare", source_token: "signed-snapshot" };
    mocks.listHkkEditions.mockResolvedValue([{ id: "220", name: "Álomháború" }]);
    mocks.searchHkk.mockResolvedValue([result]);
    mocks.addWantedCard.mockResolvedValue({ ...result, id: 9, folder_id: 1, quantity: 0, wanted: true, wanted_quantity: 3, offer_count: 0 });
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");

    fireEvent.change(screen.getByPlaceholderText("Keresés lapnévre…"), { target: { value: "orkling" } });
    fireEvent.change(await screen.findByLabelText("Lapkeresés kiegészítője"), { target: { value: "220" } });
    fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    await waitFor(() => expect(mocks.searchHkk).toHaveBeenCalledWith("orkling", "220"));
    const resultCard = (await screen.findByText("Orkling bűzisten")).closest("article")!;
    fireEvent.click(within(resultCard).getByRole("button", { name: "Keresem" }));

    await waitFor(() => expect(mocks.addWantedCard).toHaveBeenCalledWith(result, 1, "normal"));
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
    mocks.listNegotiations.mockResolvedValue([{ id: 12, requester_id: 1, requester_username: "admin", requester_display_name: "admin", owner_id: 2, owner_username: "omronraktar@gmail.com", owner_display_name: "omronraktar", status: "open", reviewed_by_current_user: false, requester_confirmed_at: null, owner_confirmed_at: null, completed_at: null, card: { ...card, card_name: "Az élet teremtése (2026)" }, messages: [{ id: 3, sender_id: 2, sender_username: "omronraktar@gmail.com", sender_display_name: "omronraktar", message: "szia", created_at: "2026-10-04T14:00:00Z" }] }]);
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "Match-ek" }));

    expect(await screen.findByText("@admin ↔ @omronraktar · egyeztetés")).toBeInTheDocument();
    expect(screen.getByText("@omronraktar")).toBeInTheDocument();
    expect(screen.queryByText(/omronraktar@gmail\.com/)).not.toBeInTheDocument();
  });

  it("értékelés után Értékelve állapotot mutat új értékelőgomb helyett", async () => {
    mocks.listNegotiations.mockResolvedValue([{ id: 13, requester_id: 1, requester_username: "admin", requester_display_name: "admin", owner_id: 2, owner_username: "partner", owner_display_name: "partner", status: "completed", reviewed_by_current_user: true, requester_confirmed_at: "2026-10-04T14:00:00Z", owner_confirmed_at: "2026-10-04T14:01:00Z", completed_at: "2026-10-04T14:01:00Z", card, messages: [] }]);
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "Match-ek" }));
    expect(await screen.findByRole("button", { name: "Értékelve" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Partner értékelése" })).not.toBeInTheDocument();
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
    const previewCards = ["common", "uncommun", "rare", "ultrarare"].map((rarity, index) => ({ ...card, external_card_id: String(index + 1), card_name: `${rarity} lap`, rarity, source_token: "signed-snapshot" }));
    mocks.previewHkkEdition.mockResolvedValue({ edition: { id: "220", name: "Résföld" }, count: 4, cards: previewCards });
    mocks.importHkkEdition.mockResolvedValue({ edition: { id: "220", name: "Résföld" }, total_cards: 1, added_cards: 1, updated_cards: 0, skipped_cards: 0 });
    const { container } = render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("tab", { name: "Kiegészítő hozzáadása" }));
    await waitFor(() => expect(mocks.listHkkEditions).toHaveBeenCalledTimes(1));
    fireEvent.change(within(container.querySelector(".vault-edition-fields")!).getByLabelText("Kiegészítő"), { target: { value: "220" } });
    expect(await screen.findByText("4", { selector: ".vault-edition-import > p strong" })).toBeInTheDocument();
    const rarityOptions = within(container.querySelector(".vault-rarity-options")!);
    for (const label of ["Gyakori", "Nem gyakori", "Ritka"]) fireEvent.click(rarityOptions.getByLabelText(new RegExp(`^${label}`)));
    expect(screen.getByText("1", { selector: ".vault-edition-import > p strong" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Alapértelmezett darabszám"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiválasztott gyakoriságok hozzáadása" }));
    await waitFor(() => expect(mocks.importHkkEdition).toHaveBeenCalledWith({ edition_id: "220", folder_id: 1, quantity: 3, missing_only: false, rarities: ["ultrarare"] }));
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
      { ...card, id: 9, external_card_id: "30", card_name: "Ultraritka lap", rarity: "ultrarare" },
    ]);
    const { container } = render(<VirtualVaultPage />);
    expect(await screen.findByText(/rare – Ritka$/)).toBeInTheDocument();
    expect(screen.getByText(/common – Gyakori$/)).toBeInTheDocument();
    expect(screen.getByText(/uncommun – Nem gyakori$/)).toBeInTheDocument();
    expect(screen.getByText(/ultrarare – Ultraritka$/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mappa rendezése"), { target: { value: "external_card_id" } });
    const names = Array.from(container.querySelectorAll(".vault-card-grid .vault-card .vault-card-body > div:first-child > strong")).map((node) => node.textContent);
    expect(names).toEqual(["Gyakori lap", "Nem gyakori lap", "Ritka lap", "Ultraritka lap"]);

    fireEvent.change(screen.getByLabelText("Gyűjtemény kiegészítő szűrő"), { target: { value: "Roxat céhei" } });
    expect(screen.getByText("Ritka lap")).toBeInTheDocument();
    expect(screen.queryByText("Gyakori lap")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Gyűjtemény kiegészítő szűrő"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Gyűjtemény gyakoriság szűrő"), { target: { value: "ultrarare" } });
    expect(screen.getByText("Ultraritka lap")).toBeInTheDocument();
    expect(screen.queryByText("Ritka lap")).not.toBeInTheDocument();
  });

  it("kiválasztott kiegészítőt keresőszó nélkül is teljesen böngész", async () => {
    const result = { ...card, external_card_id: "22001", card_name: "HKK30 lap", source_token: "signed", print_variant: undefined };
    mocks.listHkkEditions.mockResolvedValue([{ id: "220", name: "HKK30" }]);
    mocks.searchHkk.mockResolvedValue([result]);
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.change(screen.getByLabelText("Lapkeresés kiegészítője"), { target: { value: "220" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiegészítő lapjai" }));
    await waitFor(() => expect(mocks.searchHkk).toHaveBeenCalledWith("", "220"));
    expect(await screen.findByText("HKK30 lap")).toBeInTheDocument();
  });

  it("a tartalommal együtt csak névbeírásos megerősítés után törli a mappát", async () => {
    mocks.deleteVaultFolder.mockResolvedValue(undefined);
    vi.spyOn(window, "prompt").mockReturnValue("Xenó");
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "Xenó törlése" }));
    const dialog = await screen.findByRole("dialog", { name: "Almappa törlése" });
    expect(within(dialog).getByText("Xenó")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 lapbejegyzés/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mappa és 1 lap törlése" }));
    await waitFor(() => expect(mocks.deleteVaultFolder).toHaveBeenCalledWith(1, { moveToFolderId: undefined, deleteContents: true }));
  });

  it("a match nézet csak a tényleges találatokat teszi a reszponzív gridbe", async () => {
    mocks.listVaultCards.mockResolvedValue([
      { ...card, wanted: true, wanted_quantity: 1, offer_count: 2 },
      { ...card, id: 6, external_card_id: "none", card_name: "Még nincs ajánlat", wanted: true, wanted_quantity: 2, offer_count: 0 },
    ]);
    const { container } = render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.click(screen.getByRole("button", { name: "Match-ek" }));
    expect(container.querySelectorAll(".vault-match-card")).toHaveLength(1);
    expect(screen.getByText("1 keresett laphoz még nincs ajánlat.")).toBeInTheDocument();
  });

  it("külön nyomtatási változatot adhat hozzá ugyanabból a találatból", async () => {
    const result = { external_card_id: "41234", card_name: "Foil próba", image_url: null, edition: "HKK30", card_type: "Lény", subtype: null, color: null, rarity: "rare", source_token: "signed" };
    mocks.searchHkk.mockResolvedValue([result]); mocks.addVaultCard.mockResolvedValue({ ...card, ...result, print_variant: "foil", quantity: 1 });
    vi.spyOn(window, "prompt").mockReturnValue("1");
    render(<VirtualVaultPage />);
    await screen.findByText("Xenó lárva");
    fireEvent.change(screen.getByPlaceholderText("Keresés lapnévre…"), { target: { value: "foil" } });
    fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    const article = (await screen.findByText("Foil próba")).closest("article")!;
    fireEvent.change(within(article).getByLabelText("Foil próba hozzáadandó változata"), { target: { value: "foil" } });
    fireEvent.click(within(article).getByRole("button", { name: "Mappába teszem" }));
    await waitFor(() => expect(mocks.addVaultCard).toHaveBeenCalledWith(result, 1, 1, "foil"));
  });

  it("kölcsönadást rögzít és aktív kölcsönt lezár", async () => {
    const loan = { id: 9, collection_card_id: 5, external_card_id: "hkk-1", card_name: "Xenó lárva", print_variant: "normal", quantity: 1, borrower_name: "Játékos", borrower_user_id: null, lent_at: "2026-10-07", due_at: null, note: null, status: "active", returned_at: null, created_at: "2026-10-07T10:00:00Z" };
    mocks.createCardLoan.mockResolvedValue(loan); mocks.listCardLoans.mockResolvedValue([loan]); mocks.returnCardLoan.mockResolvedValue({ ...loan, status: "returned" });
    const prompt = vi.spyOn(window, "prompt"); prompt.mockReturnValueOnce("Játékos").mockReturnValueOnce("1").mockReturnValueOnce("2026-10-07").mockReturnValueOnce("").mockReturnValueOnce("");
    render(<VirtualVaultPage />);
    const cardArticle = (await screen.findByText("Xenó lárva")).closest("article")!;
    fireEvent.click(within(cardArticle).getByRole("button", { name: "Kölcsönadom" }));
    await waitFor(() => expect(mocks.createCardLoan).toHaveBeenCalledWith(5, expect.objectContaining({ quantity: 1, borrower_name: "Játékos" })));
    fireEvent.click(screen.getByRole("button", { name: "Kölcsönadott lapjaim" }));
    fireEvent.click(await screen.findByRole("button", { name: "Visszakaptam" }));
    await waitFor(() => expect(mocks.returnCardLoan).toHaveBeenCalledWith(9));
  });
});
