import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityTradeBrowserPage } from "./CommunityTradeBrowserPage";

const mocks = vi.hoisted(() => ({ listCommunityTradeCards: vi.fn(), expressTradeInterest: vi.fn() }));
const auth = vi.hoisted(() => ({ isAuthenticated: true, user: { id: 7, username: "kereso" } as { id: number; username: string } | null }));
vi.mock("../api/vault", () => ({ ...mocks }));
vi.mock("../AuthContext", () => ({ useAuth: () => auth }));

const card = {
  id: 12, external_card_id: "12064", card_name: "Angyalgólem", image_url: null, edition: "Promóciós lapok (2026)", card_type: "Lény", subtype: null, color: null, rarity: "rare",
  quantity: 1, folder_id: null, wanted: false, wanted_quantity: 0, offer_count: 0, print_variant: "fa", in_trade: true, trade_card_id: 12,
  owner_id: 9, owner_username: "gazda", seeker_count: 1, is_wanted: true, is_match: true, can_express_interest: true,
};
const page = { items: [card], total: 1, page: 1, page_size: 20, total_pages: 1 };
function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>; }

describe("CommunityTradeBrowserPage", () => {
  beforeEach(() => { vi.clearAllMocks(); auth.isAuthenticated = true; auth.user = { id: 7, username: "kereso" }; mocks.listCommunityTradeCards.mockResolvedValue(page); mocks.expressTradeInterest.mockResolvedValue({ id: 33 }); });

  it("a személyes Match jelzést csak kiegészítő információként mutatja és a meglévő egyeztetésbe lép", async () => {
    render(<MemoryRouter initialEntries={["/vault/community"]}><Routes><Route path="*" element={<><CommunityTradeBrowserPage/><Location/></>}/></Routes></MemoryRouter>);
    expect(await screen.findByText("Angyalgólem")).toBeInTheDocument();
    expect(screen.getByText("Keresett lapod")).toBeInTheDocument();
    expect(screen.getByText("Match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Érdekel" }));
    await waitFor(() => expect(mocks.expressTradeInterest).toHaveBeenCalledWith(12));
    expect(screen.getByTestId("location")).toHaveTextContent("/vault?area=trade&view=matches");
  });

  it("kijelentkezve nem jelenít meg személyes adatot és belépést kér", async () => {
    auth.isAuthenticated = false; auth.user = null;
    mocks.listCommunityTradeCards.mockResolvedValue({ ...page, items: [{ ...card, is_wanted: null, is_match: null, can_express_interest: false }] });
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    expect(await screen.findByText("Angyalgólem")).toBeInTheDocument();
    expect(screen.queryByText("Keresett lapod")).not.toBeInTheDocument();
    expect(screen.queryByText("Match")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Belépés az érdeklődéshez" })).toHaveAttribute("href", "/login?next=%2Fvault%2Fcommunity");
  });

  it("a közösségi rácsban nem nyit hoveres képnagyítást", async () => {
    render(<MemoryRouter><CommunityTradeBrowserPage/></MemoryRouter>);
    const image = await screen.findByAltText("Angyalgólem");
    fireEvent.pointerEnter(image.closest(".card-image-preview")!);
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(screen.queryByAltText("Angyalgólem nagyított képe")).not.toBeInTheDocument();
  });
});
