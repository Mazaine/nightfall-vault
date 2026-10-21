import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityTradeBrowserPage } from "./CommunityTradeBrowserPage";

const mocks = vi.hoisted(() => ({ listCommunityTradeCards: vi.fn(), expressTradeInterest: vi.fn(), getCommunityTradeFilterOptions: vi.fn(), listCommunityTradeOwners: vi.fn(), listCommunityTradeOffers: vi.fn(), listCommunityWantedOverlap: vi.fn() }));
const auth = vi.hoisted(() => ({ isAuthenticated: true, user: { id: 7, username: "kereso" } as { id: number; username: string } | null }));
vi.mock("../api/vault", () => ({ ...mocks }));
vi.mock("../AuthContext", () => ({ useAuth: () => auth }));

const card = {
  id: 12, external_card_id: "12064", card_name: "Angyalgólem", image_url: null, edition: "Promóciós lapok (2026)", card_type: "Lény", subtype: null, color: null, rarity: "rare",
  quantity: 1, folder_id: null, wanted: false, wanted_quantity: 0, offer_count: 0, print_variant: "fa", in_trade: true, trade_card_id: 12,
  owner_id: 9, owner_username: "gazda", seeker_count: 1, is_wanted: true, is_match: true, can_express_interest: true, grouped: false, total_quantity: 1, variant_quantities: { fa: 1 }, last_updated_at: "2026-10-20T10:00:00Z", owner_rating: 4.5, owner_rating_count: 2,
};
const page = { items: [card], total: 1, page: 1, page_size: 20, total_pages: 1 };
function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>; }

describe("CommunityTradeBrowserPage", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); auth.isAuthenticated = true; auth.user = { id: 7, username: "kereso" }; mocks.listCommunityTradeCards.mockResolvedValue(page); mocks.expressTradeInterest.mockResolvedValue({ id: 33 }); mocks.getCommunityTradeFilterOptions.mockResolvedValue({ editions: ["Promóciós lapok (2026)"], rarities: ["rare"], colors: [], card_types: ["Lény"] }); mocks.listCommunityTradeOwners.mockResolvedValue([]); mocks.listCommunityTradeOffers.mockResolvedValue([card]); mocks.listCommunityWantedOverlap.mockResolvedValue([]); });

  it("Cseremappák néven jelenik meg", async () => {
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    expect(await screen.findByText("Cseremappák")).toBeInTheDocument();
    expect(screen.queryByText("Közösségi Cseremappa")).not.toBeInTheDocument();
  });

  it("a személyes Match jelzést csak kiegészítő információként mutatja és a meglévő egyeztetésbe lép", async () => {
    render(<MemoryRouter initialEntries={["/vault/community"]}><Routes><Route path="*" element={<><CommunityTradeBrowserPage/><Location/></>}/></Routes></MemoryRouter>);
    expect(await screen.findByText("Angyalgólem")).toBeInTheDocument();
    expect(screen.getByText("Keresett lapod")).toBeInTheDocument();
    expect(screen.getByText("Match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Érdekel" }));
    await waitFor(() => expect(mocks.expressTradeInterest).toHaveBeenCalledWith(12));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/vault?area=trade&view=matches"));
  });

  it("kijelentkezve nem jelenít meg személyes adatot és belépést kér", async () => {
    auth.isAuthenticated = false; auth.user = null;
    mocks.listCommunityTradeCards.mockResolvedValue({ ...page, items: [{ ...card, is_wanted: null, is_match: null, can_express_interest: false }] });
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    expect(await screen.findByText("Angyalgólem")).toBeInTheDocument();
    expect(screen.queryByText("Keresett lapod")).not.toBeInTheDocument();
    expect(screen.queryByText("Match")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Belépés" })).toHaveAttribute("href", "/login?next=%2F");
  });

  it("csoportos lapnál megnyitja a részletes ajánlatlistát", async () => {
    mocks.listCommunityTradeCards.mockResolvedValue({ ...page, items: [{ ...card, grouped: true, offer_count: 1 }] });
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Ajánlatok megtekintése" }));
    expect(await screen.findByRole("dialog", { name: "Angyalgólem ajánlatai" })).toBeInTheDocument();
    expect(mocks.listCommunityTradeOffers).toHaveBeenCalledWith("12064", "Promóciós lapok (2026)");
  });

  it("a közösségi rácsban nem nyit hoveres képnagyítást", async () => {
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    const image = await screen.findByAltText("Angyalgólem");
    fireEvent.pointerEnter(image.closest(".card-image-preview")!);
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(screen.queryByAltText("Angyalgólem nagyított képe")).not.toBeInTheDocument();
  });

  it("globális listanézetet ment és csak ott használ hoveres képnagyítást", async () => {
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    await screen.findByText("Angyalgólem");
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(localStorage.getItem("nightfall-vault-card-display-mode")).toBe("list");
    const image = screen.getByAltText("Angyalgólem");
    expect(image.closest(".community-trade-list-row")).toBeInTheDocument();
    fireEvent.pointerEnter(image.closest(".card-image-preview")!);
    expect(await screen.findByAltText("Angyalgólem nagyított képe")).toBeInTheDocument();
  });

  it("a mentett keresés átnevezhető natív prompt nélkül", async () => {
    const prompt = vi.spyOn(window, "prompt");
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    await screen.findByText("Angyalgólem");
    fireEvent.change(screen.getByLabelText("Mentés neve"), { target: { value: "Ritka lapok" } });
    fireEvent.click(screen.getByRole("button", { name: "Keresés mentése" }));
    fireEvent.click(screen.getByRole("button", { name: "Ritka lapok átnevezése" }));
    fireEvent.change(screen.getByLabelText("Ritka lapok új neve"), { target: { value: "2026-os ritkák" } });
    fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
    expect(screen.getByRole("button", { name: "2026-os ritkák" })).toBeInTheDocument();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("a játékosnézet tulajdonosonként csoportosít", async () => {
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    await screen.findByText("Angyalgólem");
    fireEvent.click(screen.getByRole("tab", { name: "Játékosok mappái" }));
    fireEvent.click(screen.getByRole("button", { name: "Szűrés" }));
    expect(await screen.findByRole("heading", { name: "gazda" })).toBeInTheDocument();
    expect(screen.getByText("1 cserelap")).toBeInTheDocument();
    await waitFor(() => expect(mocks.listCommunityTradeCards).toHaveBeenLastCalledWith(expect.objectContaining({ view: "players", page: 1 })));
  });
});
