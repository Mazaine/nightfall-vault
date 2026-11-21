import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SellerInventoryPage } from "./SellerInventoryPage";

const mocks = vi.hoisted(() => ({ items: vi.fn(), sources: vi.fn(), history: vi.fn(), upload: vi.fn(), apply: vi.fn(), edit: vi.fn(), bulk: vi.fn(), operation: vi.fn(), export: vi.fn(), undoPreview: vi.fn(), undo: vi.fn() }));
vi.mock("../api/inventory", () => ({ stockItems: mocks.items, stockSources: mocks.sources, stockHistory: mocks.history, uploadStock: mocks.upload, applyStock: mocks.apply, editStockRow: mocks.edit, bulkStock: mocks.bulk, stockOperation: mocks.operation, exportStock: mocks.export, undoStockPreview: mocks.undoPreview, undoStock: mocks.undo }));
const op = { id: 8, kind: "import", status: "preview", total: 1, version: "a".repeat(64), counts: { new: 1, applied: 0 }, changes_count: 0, context: {}, rows: [{ line: 5, state: "valid", action: "new", values: { name: "Árnyék", quantity: 150, price: 500, graphic_type: "normal", condition: "NM", status: "active" }, issues: [] }] };
describe("Eladói készletkezelő", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items.mockResolvedValue({ total: 1, items: [{ id: 2, name: "Árnyék", card_id: "123", graphic_type: "normal", edition: "2026", condition: "NM", free: 150, reserved: 2, pending: 3, price: 500, status: "active", retro: true, link: null }] });
    mocks.sources.mockResolvedValue([{ id: 1, name: "Saját Excel", mapping: {} }]); mocks.history.mockResolvedValue([]); mocks.upload.mockResolvedValue(op); mocks.apply.mockResolvedValue({ ...op, counts: { applied: 1 }, rows: [{ ...op.rows[0], state: "applied" }] }); mocks.bulk.mockResolvedValue({ ...op, kind: "bulk" });
  });
  it("minden eladónak megjeleníti a készletet és a három feladási lehetőséget", async () => {
    render(<MemoryRouter><SellerInventoryPage /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Árnyék" })).toHaveAttribute("href", "/auctions/2");
    expect(screen.getByRole("navigation", { name: "Hirdetésfeladás" })).toHaveTextContent("Készletkezelő");
    expect(screen.getByText("Foglalt: 2 · Ügyletben: 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Név / HKK ID"), { target: { value: "123" } });
    await waitFor(() => expect(mocks.items.mock.lastCall?.[0].get("query")).toBe("123"));
  });
  it("feltöltéskor csak előnézet készül, külön jóváhagyás ment", async () => {
    render(<MemoryRouter><SellerInventoryPage /></MemoryRouter>);
    await screen.findByRole("link", { name: "Árnyék" });
    fireEvent.change(screen.getByLabelText("Forrás"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("CSV vagy Excel"), { target: { files: [new File(["name;quantity;price\nÁrnyék;150;500"], "sample.csv")] } });
    fireEvent.submit(screen.getByRole("button", { name: "Importelőnézet" }).closest("form")!);
    await screen.findByRole("heading", { name: "Előnézet #8" });
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Alkalmazható sorok mentése (max. 200)" }));
    const dialog = screen.getByRole("dialog", { name: "Készletmódosítás megerősítése" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mégse" }));
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Alkalmazható sorok mentése (max. 200)" }));
    fireEvent.click(screen.getByRole("button", { name: "Jóváhagyom" }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(op, null, false));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("a kijelöltek százalékos módosítását is előnézetbe küldi", async () => {
    render(<MemoryRouter><SellerInventoryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText("Árnyék kijelölése"));
    fireEvent.change(screen.getByLabelText("Árművelet"), { target: { value: "percent_down" } });
    fireEvent.change(screen.getByLabelText("Árérték"), { target: { value: "20" } });
    fireEvent.submit(screen.getByRole("button", { name: "Módosítások előnézete" }).closest("form")!);
    await waitFor(() => expect(mocks.bulk).toHaveBeenCalledWith(expect.objectContaining({ ids: [2], price_mode: "percent_down", price_value: 20 })));
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("az ismeretlen oszlopokat külön megfeleltetéssel küldi újra", async () => {
    mocks.upload.mockResolvedValueOnce({ needs_mapping: true, headers: ["Lap", "Db", "Ft"], mapping: {}, header_row: 4 }).mockResolvedValueOnce(op);
    render(<MemoryRouter><SellerInventoryPage /></MemoryRouter>);
    await screen.findByRole("link", { name: "Árnyék" });
    fireEvent.change(screen.getByLabelText("Forrás"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("CSV vagy Excel"), { target: { files: [new File(["Lap;Db;Ft"], "sample.csv")] } });
    const form = screen.getByRole("button", { name: "Importelőnézet" }).closest("form")!;
    fireEvent.submit(form);
    const mapping = await screen.findByRole("group", { name: "Oszlopok megfeleltetése" });
    fireEvent.change(within(mapping).getByLabelText("Lapnév"), { target: { value: "Lap" } });
    fireEvent.change(within(mapping).getByLabelText("Darabszám"), { target: { value: "Db" } });
    fireEvent.change(within(mapping).getByLabelText("Egységár (Ft)"), { target: { value: "Ft" } });
    fireEvent.submit(form);
    await screen.findByRole("heading", { name: "Előnézet #8" });
    const data = mocks.upload.mock.lastCall?.[0] as FormData;
    expect(JSON.parse(String(data.get("mapping")))).toEqual({ name: "Lap", quantity: "Db", price: "Ft" });
    expect(data.get("header_row")).toBe("4"); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("a kijelölt export terjedelmét és formátumát pontosan adja át", async () => {
    render(<MemoryRouter><SellerInventoryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText("Árnyék kijelölése"));
    fireEvent.change(screen.getByLabelText("Formátum"), { target: { value: "hkk" } });
    fireEvent.click(screen.getByLabelText("Inaktív tételek is"));
    fireEvent.click(screen.getByRole("button", { name: "Kijelöltek exportja" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    const params = mocks.export.mock.lastCall?.[0] as URLSearchParams;
    expect(params.get("ids")).toBe("2"); expect(params.get("format")).toBe("hkk"); expect(params.get("include_inactive")).toBe("true");
  });
  it("a visszavonást csak biztonságos előnézet után engedi", async () => {
    mocks.history.mockResolvedValue([{ id: 8, kind: "import", status: "applied", created_at: "2026-11-21T12:00:00Z" }]);
    mocks.undoPreview.mockResolvedValue({ can_undo: false, conflicts: [2], count: 1, token: "a" });
    render(<MemoryRouter><SellerInventoryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Visszavonás ellenőrzése" }));
    await screen.findByRole("dialog", { name: "Visszavonás" });
    expect(screen.getByRole("button", { name: "Visszavonom" })).toBeDisabled();
    expect(mocks.undo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mégse" }));
    mocks.undoPreview.mockResolvedValue({ can_undo: true, conflicts: [], count: 1, token: "b" });
    fireEvent.click(screen.getByRole("button", { name: "Visszavonás ellenőrzése" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Visszavonom" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Visszavonom" }));
    await waitFor(() => expect(mocks.undo).toHaveBeenCalledWith(8, "b"));
  });
});
