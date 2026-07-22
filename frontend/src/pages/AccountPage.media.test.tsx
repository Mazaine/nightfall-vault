import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "./AccountPage";

const mocks = vi.hoisted(() => ({
  listMyAuctions: vi.fn(),
  listMyBidAuctions: vi.fn(),
  getAuction: vi.fn(),
  createAuction: vi.fn(),
  updateAuction: vi.fn(),
  uploadAuctionImage: vi.fn(),
  activateAuction: vi.fn(),
  setAuctionCoverImage: vi.fn(),
  deleteAuctionImage: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../api/auctions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auctions")>()),
  ...mocks,
}));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("../NotificationContext", () => ({
  useNotifications: () => ({ subscribe: () => () => undefined, showToast: mocks.showToast }),
}));

function file(name: string, type = "image/png") {
  return new File(["image"], name, { type });
}

function renderPage() {
  render(<MemoryRouter><AccountPage section="auctions" /></MemoryRouter>);
}

function fillRequiredForm() {
  const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const futureEnd = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const localValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  fireEvent.change(screen.getByLabelText(/^Név/), { target: { value: "Teszt aukció" } });
  fireEvent.change(screen.getByLabelText(/^Leírás/), { target: { value: "Részletes leírás" } });
  fireEvent.change(screen.getByLabelText(/Kezdőár/), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText(/Licitlépcső/), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Kezdési dátum"), { target: { value: localValue(futureStart) } });
  fireEvent.change(screen.getByLabelText("Lejárati dátum"), { target: { value: localValue(futureEnd) } });
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

  it("több külön fájlválasztásból összeadja a képeket és megtartja a borítóképet", async () => {
    renderPage();
    const input = await screen.findByLabelText("Képek");
    fireEvent.change(input, { target: { files: [file("egy.png"), file("ketto.png")] } });
    fireEvent.click(screen.getAllByRole("radio")[1]);

    fireEvent.change(input, { target: { files: [file("harom.png"), file("negy.png"), file("ot.png"), file("hat.png")] } });

    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByText("egy.png")).toBeInTheDocument();
    expect(screen.getByText("harom.png")).toBeInTheDocument();
    expect(screen.queryByText("hat.png")).not.toBeInTheDocument();
    expect(within(screen.getByText("ketto.png").closest("label")!).getByText("Borítókép")).toBeInTheDocument();
    expect(screen.getByText(/a korábban kiválasztott képeket megtartottuk/)).toBeInTheDocument();
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

  it("sikeres aukció-létrehozás után magyar toast visszajelzést ad", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Képek"), { target: { files: [file("card.png")] } });
    fillRequiredForm();
    fireEvent.click(screen.getByRole("button", { name: "Aukció létrehozása" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith({
      title: "Aukció létrehozva",
      message: "A képek feltöltése és az aukció aktiválása vagy időzítése sikeres.",
      targetUrl: "/account/auctions",
    }));
    expect(document.querySelector('input[name="title"]')).toHaveValue("");
    expect(screen.queryByText(/Cannot read properties of null/)).not.toBeInTheDocument();
  });

  it("a backend képfeltöltési hibáját a konkrét fájlnévvel jeleníti meg", async () => {
    mocks.uploadAuctionImage.mockRejectedValue(new Error("A kép pixelszáma túl nagy."));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Képek"), { target: { files: [file("huge.png")] } });
    fillRequiredForm();
    fireEvent.click(screen.getByRole("button", { name: "Aukció létrehozása" }));
    await waitFor(() => expect(screen.getByText("huge.png: A kép pixelszáma túl nagy.")).toBeInTheDocument());
  });

  it("magyar hibaüzenetet ad múltbeli kezdési dátumnál", async () => {
    renderPage();
    fillRequiredForm();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const localValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    fireEvent.change(screen.getByLabelText("Kezdési dátum"), { target: { value: localValue(past) } });
    fireEvent.change(screen.getByLabelText("Lejárati dátum"), { target: { value: localValue(future) } });
    fireEvent.click(screen.getByRole("button", { name: "Aukció létrehozása" }));

    expect(await screen.findByText("A kezdési dátum nem lehet korábbi a jelenlegi időpontnál.")).toBeInTheDocument();
    expect(document.querySelector('input[name="starts_at"]')).toHaveAttribute("aria-invalid", "true");
    expect(mocks.createAuction).not.toHaveBeenCalled();
  });

  it("a túl hosszú nevet magyar mezőhibával jelzi és nem küldi el", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Képek"), { target: { files: [file("card.png")] } });
    fillRequiredForm();
    fireEvent.change(screen.getByLabelText(/^Név/), { target: { value: "A".repeat(181) } });
    fireEvent.click(screen.getByRole("button", { name: "Aukció létrehozása" }));

    expect(await screen.findByText("A név legfeljebb 180 karakter hosszú lehet.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Név/)).toHaveAttribute("aria-invalid", "true");
    expect(mocks.createAuction).not.toHaveBeenCalled();
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

  it("a teljes aukcióadatokkal, módosítható alapadatokkal nyitja meg a szerkesztőt", async () => {
    const listItem = { id: 92, seller_id: 2, title: "Aktív tesztaukció", category: "Pokemon", condition: "fresh", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-15T10:00:00Z", ends_at: "2026-07-27T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [] };
    mocks.listMyAuctions.mockResolvedValue([listItem]);
    mocks.getAuction.mockResolvedValue({ ...listItem, description: "Régi, részletes leírás" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Módosítás" }));
    const form = await screen.findByRole("form", { name: "Aktív tesztaukció módosítása" });
    const editor = within(form);
    expect(mocks.getAuction).toHaveBeenCalledWith(92);
    expect(editor.getByLabelText(/^Leírás/)).toHaveValue("Régi, részletes leírás");
    expect(editor.getByLabelText(/^Név/)).toBeEnabled();
    expect(editor.getByLabelText("Kategória")).toBeEnabled();
    expect(editor.getByLabelText("Állapot")).toBeEnabled();
    expect(editor.getByLabelText(/Kezdőár/)).toBeDisabled();
    expect(editor.getByLabelText(/Licitlépcső/)).toBeDisabled();

    fireEvent.change(editor.getByLabelText(/^Név/), { target: { value: "Módosított aukciónév" } });
    fireEvent.change(editor.getByLabelText("Kategória"), { target: { value: "Magic the Gathering" } });
    fireEvent.change(editor.getByLabelText("Állapot"), { target: { value: "Újszerű" } });
    fireEvent.change(editor.getByLabelText(/^Leírás/), { target: { value: "Frissített leírás" } });
    fireEvent.click(editor.getByRole("button", { name: "Módosítások mentése" }));

    await waitFor(() => expect(mocks.updateAuction).toHaveBeenCalledWith(92, expect.objectContaining({
      title: "Módosított aukciónév",
      category: "Magic the Gathering",
      condition: "like_new",
      description: "Frissített leírás",
      five_minute_rule_enabled: true,
    })));
  });

  it("magyar mezőhibákat mutat hibás aukciómódosításnál", async () => {
    const auction = { id: 93, seller_id: 2, title: "Tesztaukció", description: "Eredeti, részletes leírás", category: "Pokemon", condition: "fresh", status: "active", starting_price: "1000", bid_increment: "100", current_price: "1200", buy_now_enabled: false, buy_now_price: null, starts_at: "2026-07-15T10:00:00Z", ends_at: "2026-07-27T10:00:00Z", five_minute_rule_enabled: true, winner_id: null, highest_bid_id: null, images: [] };
    mocks.listMyAuctions.mockResolvedValue([auction]);
    mocks.getAuction.mockResolvedValue(auction);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Módosítás" }));
    const editor = within(await screen.findByRole("form", { name: "Tesztaukció módosítása" }));
    fireEvent.change(editor.getByLabelText(/^Név/), { target: { value: "A" } });
    fireEvent.change(editor.getByLabelText(/^Leírás/), { target: { value: "Rövid" } });
    fireEvent.click(editor.getByRole("button", { name: "Módosítások mentése" }));

    expect(await editor.findByText("A név legalább 2 karakter hosszú legyen.")).toBeInTheDocument();
    expect(editor.getByText("A leírás legalább 10 karakter hosszú legyen.")).toBeInTheDocument();
    expect(editor.getByRole("alert")).toHaveTextContent("Javítsd a megjelölt mezőket.");
    expect(mocks.updateAuction).not.toHaveBeenCalled();
  });
});
