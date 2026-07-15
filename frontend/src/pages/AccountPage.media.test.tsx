import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "./AccountPage";

const mocks = vi.hoisted(() => ({
  listMyAuctions: vi.fn(),
  listMyBidAuctions: vi.fn(),
  createAuction: vi.fn(),
  updateAuction: vi.fn(),
  uploadAuctionImage: vi.fn(),
  activateAuction: vi.fn(),
  setAuctionCoverImage: vi.fn(),
  deleteAuctionImage: vi.fn(),
}));

vi.mock("../api/auctions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auctions")>()),
  ...mocks,
}));

function file(name: string, type = "image/png") {
  return new File(["image"], name, { type });
}

function renderPage() {
  render(<MemoryRouter><AccountPage section="auctions" /></MemoryRouter>);
}

function fillRequiredForm() {
  fireEvent.change(screen.getByLabelText("Név"), { target: { value: "Teszt aukció" } });
  fireEvent.change(screen.getByLabelText("Leírás"), { target: { value: "Részletes leírás" } });
  fireEvent.change(screen.getByLabelText(/Kezdőár/), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText(/Licitlépcső/), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Kezdési dátum"), { target: { value: "2026-07-16T10:00" } });
  fireEvent.change(screen.getByLabelText("Lejárati dátum"), { target: { value: "2026-07-17T10:00" } });
  fireEvent.click(screen.getByText(/Elfogadom, hogy jogosult/).closest("label")!.querySelector("input")!);
}

describe("AccountPage media upload", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.listMyAuctions.mockResolvedValue([]);
    mocks.listMyBidAuctions.mockResolvedValue([]);
    mocks.createAuction.mockResolvedValue({ id: 91 });
    mocks.updateAuction.mockResolvedValue({});
    mocks.uploadAuctionImage.mockResolvedValue({});
    mocks.activateAuction.mockResolvedValue({ id: 91, status: "scheduled" });
    mocks.setAuctionCoverImage.mockResolvedValue({});
    mocks.deleteAuctionImage.mockResolvedValue({});
  });

  it("legfeljebb öt képet tart meg és támogatja a borítóválasztást és törlést", async () => {
    renderPage();
    const input = await screen.findByLabelText("Képek");
    fireEvent.change(input, { target: { files: [1, 2, 3, 4, 5, 6].map((value) => file(`${value}.png`)) } });
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByText(/Legfeljebb 5 képet/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("radio")[2]);
    expect(screen.getAllByText("Borítókép")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Kép eltávolítása" })[1]);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("feltöltés közben letiltja az ismételt küldést és fájlszintű állapotot mutat", async () => {
    mocks.uploadAuctionImage.mockReturnValue(new Promise(() => undefined));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Képek"), { target: { files: [file("card.png")] } });
    fillRequiredForm();
    fireEvent.click(screen.getByRole("button", { name: "Aukció létrehozása" }));
    expect(await screen.findByRole("button", { name: "Feltöltés és feldolgozás..." })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("card.png feltöltése és feldolgozása");
  });

  it("a backend képfeltöltési hibáját a konkrét fájlnévvel jeleníti meg", async () => {
    mocks.uploadAuctionImage.mockRejectedValue(new Error("A kép pixelszáma túl nagy."));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Képek"), { target: { files: [file("huge.png")] } });
    fillRequiredForm();
    fireEvent.click(screen.getByRole("button", { name: "Aukció létrehozása" }));
    await waitFor(() => expect(screen.getByText("huge.png: A kép pixelszáma túl nagy.")).toBeInTheDocument());
  });

  it("meglévő piszkozatnál backend művelettel állít borítót és töröl képet", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.listMyAuctions.mockResolvedValue([{ id: 91, seller_id: 2, title: "Képes piszkozat", description: "Leírás", category: "Pokemon", condition: "fresh", status: "draft", starting_price: "1000", bid_increment: "100", current_price: "1000", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-16T10:00:00Z", ends_at: "2026-07-17T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [{ id: 10, auction_id: 91, storage_key: "original.webp", url: "/media/original.webp", thumbnail_url: "/media/thumb.webp", original_filename: "one.png", content_type: "image/webp", file_size: 10, position: 0, is_cover: false, created_at: "2026-07-15T10:00:00Z" }] }]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Módosítás" }));
    fireEvent.click(await screen.findByRole("button", { name: "Legyen borítókép" }));
    await waitFor(() => expect(mocks.setAuctionCoverImage).toHaveBeenCalledWith(91, 10));
    fireEvent.click(screen.getByRole("button", { name: "Kép törlése" }));
    await waitFor(() => expect(mocks.deleteAuctionImage).toHaveBeenCalledWith(91, 10));
  });

  it("a felugró prompt helyett előre kitöltött szerkesztő űrlapot nyit", async () => {
    mocks.listMyAuctions.mockResolvedValue([{ id: 92, seller_id: 2, title: "Aktív tesztaukció", description: "Régi leírás", category: "Pokemon", condition: "fresh", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-15T10:00:00Z", ends_at: "2026-07-17T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [] }]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Módosítás" }));
    const form = screen.getByRole("form", { name: "Aktív tesztaukció módosítása" });
    const editor = within(form);
    expect(editor.getByLabelText("Leírás")).toHaveValue("Régi leírás");
    expect(editor.getByLabelText(/Kezdőár/)).toBeDisabled();
    expect(editor.getByLabelText(/Licitlépcső/)).toBeDisabled();

    fireEvent.change(editor.getByLabelText("Leírás"), { target: { value: "Frissített leírás" } });
    fireEvent.click(editor.getByRole("button", { name: "Módosítások mentése" }));

    await waitFor(() => expect(mocks.updateAuction).toHaveBeenCalledWith(92, expect.objectContaining({
      description: "Frissített leírás",
      five_minute_rule_enabled: true,
    })));
  });
});
