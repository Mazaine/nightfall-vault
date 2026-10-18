import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualVaultPage } from "./VirtualVaultPage";

const mocks = vi.hoisted(() => Object.fromEntries([
  "getVaultSummary", "getVaultMaintenance", "listVaultCards", "listTradeCards", "listNegotiations", "getPointHistory", "listCardLoans", "listDecks", "listHkkEditions",
  "searchHkk", "createVaultFolder", "updateVaultFolder", "reorderVaultFolders", "deleteVaultFolder", "addVaultCard", "addVaultCardVariant", "addWantedCard", "addTradeCard", "setCollectionTradeQuantities", "setVaultWanted", "previewHkkEdition", "importHkkEdition",
  "updateVaultCard", "deleteVaultCard", "deleteTradeCard", "buyVaultCapacity", "postTradeMessage", "listMatchingOffers", "expressTradeInterest", "createCardLoan", "returnCardLoan",
  "listTradeCardSeekers", "verifyTradeCard", "bulkUpdateVaultCards", "createDeck", "deleteDeck", "addDeckCard", "updateDeckCard", "deleteDeckCard", "listDeckCardOffers",
  "getMatchStatus", "markMatchesSeen", "createStandaloneCardLoans",
  "getHkkMarketPriceSuggestion",
].map((name) => [name, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>);
vi.mock("../api/vault", () => mocks);
const notificationMocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../NotificationContext", () => ({ useNotifications: () => ({ showToast: notificationMocks.showToast }) }));

const summary = {
  total_collection_capacity: 1000, assigned_collection_capacity: 200, free_collection_capacity: 800, used_collection_slots: 1,
  trade_capacity: 200, used_trade_slots: 1, vp_balance: 120, vault_unlimited: false, owned_card_quantity: 2,
  new_trade_opportunities: 1, unseen_match_count: 0, cards_wanted_by_others: 1, deck_missing_quantity: 2, active_loan_count: 1,
  folders: [{ id: 1, name: "Xenó", capacity: 200, position: 0, color: "#7c3aed", used_slots: 1, entry_count: 1, copy_count: 2 }],
};
const card = { id: 5, external_card_id: "101", card_name: "Xenó lárva", image_url: null, edition: "Teszt", card_type: "Lény", subtype: null, color: null, rarity: "rare", quantity: 2, folder_id: 1, wanted: true, wanted_quantity: 1, offer_count: 1, print_variant: "normal", in_trade: false, trade_card_id: null };
const hkk = { external_card_id: "202", card_name: "Orkling", image_url: null, edition: "Álomháború", card_type: "Lény", subtype: null, color: null, rarity: "rare", source_token: "signed-snapshot-token-that-is-long-enough" };

describe("VirtualVaultPage", () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear();
    mocks.getVaultSummary.mockResolvedValue(summary); mocks.listVaultCards.mockResolvedValue([card]);
    mocks.listTradeCards.mockResolvedValue([{ ...card, owner_id: 1, owner_username: "admin", seeker_count: 1 }]);
    mocks.listNegotiations.mockResolvedValue([]); mocks.getPointHistory.mockResolvedValue({ balance: 120, items: [] });
    mocks.listCardLoans.mockResolvedValue([]); mocks.listDecks.mockResolvedValue([]);
    mocks.getVaultMaintenance.mockResolvedValue({ stale_after_days: 21, acquired_wanted: [], stale_trade_cards: [], overdue_loans: [] });
    mocks.listHkkEditions.mockResolvedValue([{ id: "220", name: "Álomháború", group: null, release_date: "2026-01-01" }]);
    mocks.getMatchStatus.mockResolvedValue({ unseen_count: 0, match_keys: [] });
    mocks.markMatchesSeen.mockResolvedValue({ updated: 0 });
    mocks.getHkkMarketPriceSuggestion.mockResolvedValue({ recommended_price: null, minimum_price: null, maximum_price: null, offer_count: 0 });
  });

  it("valós számlálókkal induló, kattintható áttekintőt és külön lapfelviteli területet mutat", async () => {
    render(<VirtualVaultPage />);
    expect(await screen.findByText("Mi történt a mappádban?")).toBeInTheDocument();
    expect(screen.getByText("Összes saját lap").closest("button")).toHaveTextContent("2");
    expect(screen.getByRole("navigation", { name: "Virtuális mappa területei" }).querySelectorAll("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Lapfelvitel" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Paklikból hiányzik").closest("button")!);
    expect(await screen.findByRole("heading", { name: "Paklik & verseny" })).toBeInTheDocument();
  });

  it("a kereshető kiegészítő-comboboxzal üres lapnév mellett is keres", async () => {
    mocks.searchHkk.mockResolvedValue([hkk]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?");
    fireEvent.click(screen.getByRole("button", { name: "Lapfelvitel" }));
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

  it("kompakt ikonos műveletsort mutat, a kölcsönadást nem teszi a kártyára", async () => {
    const prompt = vi.spyOn(window, "prompt");
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const article = (await screen.findByText("Xenó lárva")).closest("article")!;
    expect(within(article).queryByText("További műveletek")).not.toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "Xenó lárva törlése" })).toHaveClass("vault-card-action-icon", "is-danger");
    expect(within(article).queryByText("Törlés")).not.toBeInTheDocument();
    expect(within(article).queryByRole("button", { name: "Kölcsönadom" })).not.toBeInTheDocument();
    fireEvent.click(within(article).getByRole("button", { name: "Eladás vagy aukció" }));
    const listing = screen.getByRole("dialog", { name: "Meghirdetés · Xenó lárva" });
    expect(within(listing).getByRole("tab", { name: "Fix áras eladás" })).toHaveAttribute("aria-selected", "true");
    expect(within(listing).getByRole("tab", { name: "Aukció" })).toBeInTheDocument();
    expect(within(listing).getByLabelText("Változat")).toHaveValue("5");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("a Keresem közvetlenül kapcsolható, a Csere pedig mennyiséget kér", async () => {
    mocks.setVaultWanted.mockResolvedValue({ ...card, wanted: false });
    mocks.setCollectionTradeQuantities.mockResolvedValue({ action: "trade_quantities", processed_count: 1 });
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const article = (await screen.findByText("Xenó lárva")).closest("article")!;
    expect(article.querySelector(".vault-card-title")).toBeInTheDocument();
    expect(within(article).getByRole("region", { name: "Tulajdonságok" })).toBeInTheDocument();
    expect(within(article).getByRole("contentinfo", { name: "Lapműveletek" })).toBeInTheDocument();
    const wanted = within(article).getByRole("button", { name: "Már nem keresem" });
    expect(wanted).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(wanted);
    await waitFor(() => expect(mocks.setVaultWanted).toHaveBeenCalledWith(5, false, undefined));
    fireEvent.click(within(article).getByRole("button", { name: "Cserére kínálom" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Xenó lárva normal csere mennyisége" }), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cseremappa frissítése" }));
    await waitFor(() => expect(mocks.setCollectionTradeQuantities).toHaveBeenCalledWith([{ card_id: 5, quantity: 1 }]));
  });

  it("az almappasort csak névvel és kapacitással mutatja, a részleteket tooltipben tartja", async () => {
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const folder = await screen.findByRole("button", { name: "Xenó, 1/200 zseb" });
    expect(folder).toHaveTextContent("Xenó1/200 zseb");
    expect(folder).toHaveAttribute("title", "1 lap · 2 példány · 1/200 zseb");
    expect(screen.queryByText("1 lap · 2 példány")).not.toBeInTheDocument();
  });

  it("a globális kiegészítőválasztó katalóguscsoportokat és legújabb sorrendet használ", async () => {
    mocks.listHkkEditions.mockResolvedValue([
      { id: "264", name: "Promóciós lapok (2026)", group: "promo", release_date: "2026-11-29" },
      { id: "262", name: "Varázsnövények", group: "zen", release_date: "2026-09-11" },
      { id: "250", name: "Alfa Pakli - Víziszörnyek", group: "alpha", release_date: "2025-03-22" },
    ]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Lapfelvitel" }));
    expect(screen.queryByRole("group", { name: "Kiegészítő kategóriák" })).not.toBeInTheDocument();
    fireEvent.focus(screen.getAllByRole("combobox")[0]);
    const groups = screen.getByRole("group", { name: "Kiegészítő kategóriák" });
    expect(groups.parentElement?.firstElementChild).toBe(groups);
    expect(within(groups).getByRole("button", { name: "Zén" })).toBeInTheDocument();
    expect(within(groups).getByRole("button", { name: "Alfa" })).toBeInTheDocument();
    expect(within(groups).getByRole("button", { name: "Promo lapok" })).toBeInTheDocument();
    expect(within(groups).getByRole("button", { name: "Kódos lapok" })).toBeInTheDocument();
    const options = within(screen.getAllByRole("listbox")[0]).getAllByRole("option").map((item) => item.textContent);
    expect(options).toEqual([
      expect.stringContaining("Promóciós lapok (2026)"),
      expect.stringContaining("Varázsnövények"),
      expect.stringContaining("Alfa Pakli - Víziszörnyek"),
    ]);
    fireEvent.click(within(groups).getByRole("button", { name: "Promo lapok" }));
    expect(screen.getByRole("option", { name: /Promóciós lapok/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Varázsnövények/ })).not.toBeInTheDocument();
  });

  it("az új match badge-et megjeleníti és csak a megnyitott találatokat jelöli látottnak", async () => {
    const keys = ["a".repeat(64), "b".repeat(64)];
    mocks.getVaultSummary.mockResolvedValue({ ...summary, unseen_match_count: 2 });
    mocks.getMatchStatus.mockResolvedValue({ unseen_count: 2, match_keys: keys });
    mocks.markMatchesSeen.mockResolvedValue({ updated: 2 });
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?");
    expect(within(screen.getByRole("button", { name: /^Új cserelehetőség/ })).getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Csere" }));
    const matches = await screen.findByRole("button", { name: "Találatok (2)" });
    expect(mocks.markMatchesSeen).not.toHaveBeenCalled();
    fireEvent.click(matches);
    await waitFor(() => expect(mocks.markMatchesSeen).toHaveBeenCalledWith(keys));
    expect(await screen.findByRole("button", { name: "Találatok" })).toBeInTheDocument();
  });

  it("a normál és foil példányszámot külön, kompakt vezérlőkkel szerkeszti", async () => {
    const verified = { variant_statuses: { normal: "exists", foil: "exists", fa: "absent", gfa: "absent" }, variants_verified: true } as const;
    const foil = { ...card, ...verified, id: 6, quantity: 1, print_variant: "foil" };
    mocks.listVaultCards.mockResolvedValue([{ ...card, ...verified }, foil]);
    mocks.updateVaultCard.mockResolvedValue(foil);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const article = (await screen.findByText("Xenó lárva")).closest("article")!;
    expect(screen.getAllByText("Xenó lárva")).toHaveLength(1);
    expect(article).toHaveAttribute("data-variant-count", "2");
    const quantities = within(article).getAllByRole("combobox");
    expect(quantities.map((item) => (item as HTMLSelectElement).value)).toEqual(["2", "1"]);
    expect(within(article).getByLabelText("Xenó lárva Normál példányszáma")).toBe(quantities[0]);
    expect(within(article).getByLabelText("Xenó lárva Foil példányszáma")).toBe(quantities[1]);
    expect(quantities[0].closest("label")).toHaveClass("vault-variant-quantity");
    fireEvent.change(quantities[1], { target: { value: "7" } });
    await waitFor(() => expect(mocks.updateVaultCard).toHaveBeenCalledWith(6, { quantity: 7 }));
    expect(within(article).queryByText("FA")).not.toBeInTheDocument();
    expect(within(article).queryByText("GFA")).not.toBeInTheDocument();
  });

  it("négy meglévő változatot egyetlen kártyán, egy sorhoz tartozó vezérlőkkel mutat", async () => {
    const verified = { variant_statuses: { normal: "exists", foil: "exists", fa: "exists", gfa: "exists" }, variant_image_urls: { fa: "https://example.test/fa.jpg", gfa: "https://example.test/gfa.jpg" }, variants_verified: true } as const;
    mocks.listVaultCards.mockResolvedValue([
      { ...card, ...verified },
      { ...card, ...verified, id: 6, print_variant: "foil", quantity: 1 },
      { ...card, ...verified, id: 7, print_variant: "fa", quantity: 0 },
      { ...card, ...verified, id: 8, print_variant: "gfa", quantity: 3 },
    ]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const article = (await screen.findByText("Xenó lárva")).closest("article")!;
    expect(article).toHaveAttribute("data-variant-count", "4");
    expect(within(article).getAllByRole("combobox")).toHaveLength(4);
    expect(within(article).getByLabelText("Xenó lárva Normál példányszáma")).toHaveValue("2");
    expect(within(article).getByLabelText("Xenó lárva Foil példányszáma")).toHaveValue("1");
    expect(within(article).getByLabelText("Xenó lárva GFA példányszáma")).toHaveValue("3");
    expect(within(article).getByRole("img", { name: "Xenó lárva" })).toHaveAttribute("src", expect.stringContaining("?variant=gfa"));
    expect(within(article).queryByText("Mappa", { selector: "label" })).not.toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "Már nem keresem" })).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "Cserére kínálom" })).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "Eladás vagy aukció" })).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: "Xenó lárva törlése" })).toBeInTheDocument();
  });

  it("a hitelesített státusz alapján kínál változatokat, az ellenőrizetlennél pedig nem tilt indokolatlanul", async () => {
    const verified = { variant_statuses: { normal: "exists", foil: "absent", fa: "absent", gfa: "exists" }, variants_verified: true } as const;
    mocks.listVaultCards.mockResolvedValue([{ ...card, ...verified, rarity: "common" }, { ...card, ...verified, id: 8, rarity: "common", print_variant: "gfa", quantity: 1 }]);
    mocks.searchHkk.mockResolvedValue([{ ...hkk, rarity: "uncommon", variant_statuses: { normal: "unknown", foil: "unknown", fa: "unknown", gfa: "unknown" }, variants_verified: false }]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const variants = screen.getByLabelText("Xenó lárva változatok");
    expect(within(variants).queryByText("Foil")).not.toBeInTheDocument();
    expect(within(variants).queryByText("FA")).not.toBeInTheDocument();
    expect(within(variants).getByText("GFA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lapfelvitel" }));
    fireEvent.change(screen.getByLabelText("Lap neve"), { target: { value: "Orkling" } });
    fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    expect(await screen.findByRole("combobox", { name: "Orkling Normál példányszáma" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Orkling Foil példányszáma" })).toBeInTheDocument();
    expect(screen.getByTitle("Foil · Még nem ellenőrzött")).toBeInTheDocument();
  });

  it("sikertelen mennyiségmentésnél megtartja a rekordot és hibát jelez", async () => {
    mocks.updateVaultCard.mockRejectedValue(new Error("elutasítva"));
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Xenó lárva Normál példányszáma" }), { target: { value: "3" } });
    expect(await screen.findByText("A művelet nem sikerült.")).toBeInTheDocument();
    expect(screen.getByText("Xenó lárva")).toBeInTheDocument();
  });

  it("a cserelap keresőit csak kontextusban, publikus adatokkal mutatja", async () => {
    mocks.listTradeCardSeekers.mockResolvedValue([{ user_id: 9, username: "jatek", display_name: "Játékos", wanted_quantity: 2 }]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Csere" }));
    fireEvent.click(await screen.findByRole("button", { name: /Ki keresi ezt a lapot/ }));
    expect(await screen.findByText("Játékos")).toBeInTheDocument(); expect(screen.getByText(/@jatek/)).toBeInTheDocument();
    expect(mocks.listTradeCardSeekers).toHaveBeenCalledWith(5);
  });

  it("a cseremappából eltávolít, miközben a gyűjteménypéldány megmarad és a nézet frissül", async () => {
    mocks.deleteTradeCard.mockResolvedValue(undefined);
    render(<VirtualVaultPage />);
    await screen.findByText("Mi történt a mappádban?");
    fireEvent.click(screen.getByRole("button", { name: "Csere" }));
    expect(await screen.findByRole("button", { name: "Eltávolítás a cseremappából" })).toBeInTheDocument();
    mocks.listTradeCards.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "Eltávolítás a cseremappából" }));
    const dialog = screen.getByRole("dialog", { name: "Eltávolítás a cseremappából" });
    expect(within(dialog).getByText(/saját gyűjteményedben lévő példányok megmaradnak/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Eltávolítás" }));
    await waitFor(() => expect(mocks.deleteTradeCard).toHaveBeenCalledWith(5));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Eltávolítás a cseremappából" })).not.toBeInTheDocument());
    expect(mocks.deleteVaultCard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    expect(await screen.findByText("Xenó lárva")).toBeInTheDocument();
  });

  it("a cseremappában rács és lista nézetet vált, a hoveres nagyítás csak listában aktív", async () => {
    render(<VirtualVaultPage />);
    await screen.findByText("Mi történt a mappádban?");
    fireEvent.click(screen.getByRole("button", { name: "Csere" }));
    expect(screen.getByRole("button", { name: "Rács" })).toHaveAttribute("aria-pressed", "true");
    const gridImage = await screen.findByAltText("Xenó lárva");
    fireEvent.pointerEnter(gridImage.closest(".card-image-preview")!);
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(screen.queryByAltText("Xenó lárva nagyított képe")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".vault-trade-list-row")).toBeInTheDocument();
    const listImage = screen.getByAltText("Xenó lárva");
    fireEvent.pointerEnter(listImage.closest(".card-image-preview")!);
    expect(await screen.findByAltText("Xenó lárva nagyított képe")).toBeInTheDocument();
    fireEvent.pointerLeave(listImage.closest(".card-image-preview")!);
    await waitFor(() => expect(screen.queryByAltText("Xenó lárva nagyított képe")).not.toBeInTheDocument());
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

  it("az aktuális almappa adataiból kínál kiegészítőszűrőt", async () => {
    mocks.getVaultSummary.mockResolvedValue({ ...summary, folders: [...summary.folders, { id: 2, name: "Másik", capacity: 10, position: 1, color: null, used_slots: 1, entry_count: 1, copy_count: 1 }] });
    mocks.listVaultCards.mockResolvedValue([card, { ...card, id: 6, external_card_id: "102", card_name: "Másik lap", edition: "Másik kiegészítő", folder_id: 2 }]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    const edition = screen.getByRole("combobox", { name: "Kiegészítő keresése" });
    fireEvent.focus(edition);
    expect(screen.getByRole("option", { name: "Teszt" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Másik kiegészítő" })).not.toBeInTheDocument();
  });

  it("többértékes, ékezetfüggetlen szűrést és összes szűrő törlését biztosít", async () => {
    mocks.listVaultCards.mockResolvedValue([{ ...card, card_type: "Szörny", color: "Fairlight" }, { ...card, id: 6, external_card_id: "102", card_name: "Bűbájos lap", card_type: "Bűbáj", color: "Chara-din", wanted: false }]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    fireEvent.click(screen.getByText("Szűrők"));
    const type = screen.getByRole("combobox", { name: "Típus" });
    fireEvent.change(type, { target: { value: "szorny" } }); fireEvent.keyDown(type, { key: "Enter" });
    expect(screen.getByText("1 / 2 lap")).toBeInTheDocument();
    fireEvent.change(type, { target: { value: "bubaj" } }); fireEvent.keyDown(type, { key: "Enter" });
    expect(screen.getByText("2 / 2 lap")).toBeInTheDocument();
    const color = screen.getByRole("combobox", { name: "Szín" });
    fireEvent.change(color, { target: { value: "fairlight" } }); fireEvent.keyDown(color, { key: "Enter" });
    expect(screen.getByText("1 / 2 lap")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Összes szűrő törlése" }));
    expect(screen.getByText("2 / 2 lap")).toBeInTheDocument();
  });

  it("kijelöléssel tömegesen mozgat és cseremappába tesz", async () => {
    mocks.bulkUpdateVaultCards.mockResolvedValue({ action: "move", processed_count: 1 });
    mocks.getVaultSummary.mockResolvedValue({ ...summary, folders: [...summary.folders, { id: 2, name: "Cél", capacity: 10, position: 1, color: null, used_slots: 0, entry_count: 0, copy_count: 0 }] });
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    fireEvent.click(screen.getByRole("button", { name: "Több lap kijelölése" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Xenó lárva kijelölése" }));
    fireEvent.change(screen.getByLabelText("Célmappa"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Áthelyezés" }));
    await waitFor(() => expect(mocks.bulkUpdateVaultCards).toHaveBeenCalledWith([5], "move", 2));
    mocks.bulkUpdateVaultCards.mockResolvedValue({ action: "trade_add", processed_count: 1 });
    fireEvent.click(screen.getByRole("checkbox", { name: "Xenó lárva kijelölése" }));
    fireEvent.click(screen.getByRole("button", { name: "Cseremappába" }));
    await waitFor(() => expect(mocks.bulkUpdateVaultCards).toHaveBeenCalledWith([5], "trade_add", undefined));
  });

  it("valós karbantartási javaslatokat mutat és a Később választást megjegyzi", async () => {
    mocks.getVaultMaintenance.mockResolvedValue({ stale_after_days: 21, acquired_wanted: [{ ...card, wanted_quantity: 0 }], stale_trade_cards: [{ ...card, owner_id: 1, owner_username: "admin", seeker_count: 0 }], overdue_loans: [] });
    render(<VirtualVaultPage />);
    expect(await screen.findByText("Gyűjteményed átnézése")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "SUMMARY" && element.textContent?.includes("1 keresett lapod már megvan") === true)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Később" }));
    expect(screen.queryByText("Gyűjteményed átnézése")).not.toBeInTheDocument();
    expect(Number(localStorage.getItem("nightfall-vault-maintenance-snoozed-until"))).toBeGreaterThan(Date.now());
  });

  it("a verseny utáni rendezést a meglévő műveletekkel kínálja", async () => {
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Paklik & verseny" }));
    fireEvent.click(screen.getByText("Verseny utáni rendezés"));
    expect(screen.getByRole("button", { name: "+1 példány" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cseremappából ki" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eltávolítás" })).toBeInTheDocument();
  });

  it("a külön lapfelvitelnél több változatot és legfeljebb kilenc példányt ment", async () => {
    mocks.searchHkk.mockResolvedValue([hkk]); mocks.addVaultCard.mockResolvedValue(card);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Lapfelvitel" }));
    fireEvent.change(screen.getByLabelText("Lap neve"), { target: { value: "Orkling" } }); fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    const normal = await screen.findByRole("combobox", { name: "Orkling Normál példányszáma" });
    const foil = screen.getByRole("combobox", { name: "Orkling Foil példányszáma" });
    fireEvent.change(normal, { target: { value: "9" } }); fireEvent.change(foil, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Mappába" }));
    await waitFor(() => {
      expect(mocks.addVaultCard).toHaveBeenCalledWith(hkk, 1, 9, "normal");
      expect(mocks.addVaultCard).toHaveBeenCalledWith(hkk, 1, 2, "foil");
    });
    expect(notificationMocks.showToast).toHaveBeenCalledWith({ title: "Mappába mentve", message: "Orkling bekerült a gyűjteményedbe.", targetUrl: "/vault?area=collection" });
  });

  it("a lapfelvitel Keresem és Cseremappa műveleteiről toasttal jelez vissza", async () => {
    mocks.searchHkk.mockResolvedValue([hkk]);
    mocks.addWantedCard.mockResolvedValue(card);
    mocks.addTradeCard.mockResolvedValue({ ...card, owner_id: 1, owner_username: "admin", seeker_count: 0 });
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Lapfelvitel" }));
    fireEvent.change(screen.getByLabelText("Lap neve"), { target: { value: "Orkling" } }); fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    await screen.findByText("Orkling");
    fireEvent.click(screen.getByRole("button", { name: "Keresem" }));
    await waitFor(() => expect(notificationMocks.showToast).toHaveBeenCalledWith({ title: "Keresem listára mentve", message: "Orkling felkerült a keresett lapjaid közé.", targetUrl: "/vault?area=trade&view=wanted" }));
    fireEvent.click(screen.getByRole("button", { name: "Cseremappába" }));
    await waitFor(() => expect(notificationMocks.showToast).toHaveBeenCalledWith({ title: "Cseremappába mentve", message: "Orkling bekerült a cseremappádba.", targetUrl: "/vault?area=trade&view=trade" }));
  });

  it("a mappazsebeket utólag szerkeszti, a külön kölcsönadás pedig nem igényel gyűjteményi rekordot", async () => {
    mocks.updateVaultFolder.mockResolvedValue(summary.folders[0]); mocks.searchHkk.mockResolvedValue([hkk]); mocks.createStandaloneCardLoans.mockResolvedValue([]);
    render(<VirtualVaultPage />); await screen.findByText("Mi történt a mappádban?"); fireEvent.click(screen.getByRole("button", { name: "Gyűjtemény" }));
    fireEvent.click(screen.getByRole("button", { name: "Xenó zsebszámának módosítása" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Zsebek" }), { target: { value: "150" } }); fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
    await waitFor(() => expect(mocks.updateVaultFolder).toHaveBeenCalledWith(1, { capacity: 150 }));
    fireEvent.click(screen.getByRole("button", { name: "Kölcsönadások" })); fireEvent.click(screen.getByRole("button", { name: "Több lap kölcsönadása" }));
    fireEvent.change(screen.getByLabelText("Kölcsönadott lap keresése"), { target: { value: "Orkling" } }); fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hozzáadás" })); fireEvent.change(screen.getByLabelText("Kölcsönvevő"), { target: { value: "Béla" } });
    fireEvent.click(screen.getByRole("button", { name: "1 lap kölcsönadása" }));
    await waitFor(() => expect(mocks.createStandaloneCardLoans).toHaveBeenCalledWith([expect.objectContaining({ external_card_id: "202", quantity: 1, print_variant: "normal" })], expect.objectContaining({ borrower_name: "Béla" })));
  });
});
