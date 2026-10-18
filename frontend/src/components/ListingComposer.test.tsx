import { MemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildHkkMarketPriceUrl, ListingComposer, type ListingSource } from "./ListingComposer";

vi.mock("../api/vault", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/vault")>()),
  getHkkMarketPriceSuggestion: vi.fn().mockResolvedValue({ recommended_price: 350, minimum_price: 300, maximum_price: 400, offer_count: 2 }),
}));

const auctionMocks = vi.hoisted(() => ({ createAuction: vi.fn(), activateAuction: vi.fn(), uploadAuctionImage: vi.fn() }));
vi.mock("../api/auctions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auctions")>()),
  ...auctionMocks,
}));

const source: ListingSource = {
  externalCardId: "9888",
  cardName: "Ősi áldozat",
  edition: "Roxat céhei",
  imageUrl: null,
  variants: [{ id: 14, print_variant: "normal", quantity: 3, trade_quantity: 2, loaned_quantity: 1, listed_quantity: 1, available_listing_quantity: 1 }],
};

describe("ListingComposer piaci ár hivatkozás", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auctionMocks.createAuction.mockResolvedValue({ id: 42 });
    auctionMocks.activateAuction.mockResolvedValue({ id: 42, status: "active" });
  });
  it("URLSearchParams segítségével kezeli az ékezetes lapnevet", () => {
    const url = new URL(buildHkkMarketPriceUrl("Ősi áldozat"));
    expect(url.origin).toBe("https://hkkarfigyelo.hu");
    expect(url.searchParams.get("search")).toBe("Ősi áldozat");
    expect(url.searchParams.get("onlyInStock")).toBe("false");
    expect(buildHkkMarketPriceUrl("Ősi áldozat")).toContain("search=%C5%90si+%C3%A1ldozat");
  });

  it("fix áras és aukciós módban is biztonságos új fülön nyíló linket és árjavaslatot mutat", async () => {
    render(<MemoryRouter><ListingComposer source={source}/></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Piaci árak megtekintése" });
    expect(link).toHaveAttribute("href", buildHkkMarketPriceUrl(source.cardName));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("A bolti árak tájékoztató jellegűek. Ellenőrizd a kiegészítőt és a lapváltozatot!")).toBeInTheDocument();
    expect(await screen.findByText("Ajánlott ár: 350 Ft")).toBeInTheDocument();
    expect(screen.getByText(/2 készleten lévő, egyező bolti ár mediánja/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Aukció" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Piaci árak megtekintése" })).toHaveAttribute("href", buildHkkMarketPriceUrl(source.cardName)));
  });

  it("Vault-referenciaképpel saját fotó nélkül is aktivál, aukciónál pedig továbbítja a minimálárat", async () => {
    render(<MemoryRouter><ListingComposer source={source}/></MemoryRouter>);
    await screen.findByText("Ajánlott ár: 350 Ft");
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="price"]')!, { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Meghirdetem fix áron" }));
    await waitFor(() => expect(auctionMocks.createAuction).toHaveBeenCalledWith(expect.objectContaining({ listing_type: "fixed", reserve_price: null, vault_collection_card_id: 14 })));
    expect(auctionMocks.uploadAuctionImage).not.toHaveBeenCalled();
    expect(auctionMocks.activateAuction).toHaveBeenCalledWith(42);

    fireEvent.click(screen.getByRole("tab", { name: "Aukció" }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="price"]')!, { target: { value: "1000" } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="reserve_price"]')!, { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Aukció indítása" }));
    await waitFor(() => expect(auctionMocks.createAuction).toHaveBeenLastCalledWith(expect.objectContaining({ listing_type: "auction", reserve_price: "1500" })));
  });

  it("a ténylegesen szabad készletet mutatja és nem a teljes tulajdonolt mennyiséget", () => {
    render(<MemoryRouter><ListingComposer source={source}/></MemoryRouter>);
    expect(screen.getByLabelText("Készletbontás")).toHaveTextContent("Saját: 3");
    expect(screen.getByLabelText("Készletbontás")).toHaveTextContent("Cserében: 2");
    expect(screen.getByLabelText("Készletbontás")).toHaveTextContent("Kölcsönadva: 1");
    expect(screen.getByLabelText("Készletbontás")).toHaveTextContent("Meghirdetve: 1");
    expect(screen.getByLabelText("Készletbontás")).toHaveTextContent("Szabadon hirdethető: 1");
    expect(screen.getByLabelText("Darabszám").querySelectorAll("option")).toHaveLength(1);
  });

  it("nem engedi új hirdetésbe a felülvizsgálandó régi változatot", () => {
    const conflicted: ListingSource = {
      ...source,
      variants: [{ ...source.variants[0], print_variant: "gfa", variant_needs_review: true }],
    };
    render(<MemoryRouter><ListingComposer source={conflicted}/></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("nincs hitelesített, szabadon hirdethető változat");
    expect(screen.getByRole("button", { name: "Meghirdetem fix áron" })).toBeDisabled();
    expect(screen.getByLabelText("Változat").querySelectorAll("option")).toHaveLength(0);
  });

  it("cseremappa-forrásnál közvetlenül a cserelap azonosítóját küldi", async () => {
    render(<MemoryRouter><ListingComposer source={{ ...source, inventoryKind: "trade" }}/></MemoryRouter>);
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="price"]')!, { target: { value: "700" } });
    fireEvent.click(screen.getByRole("button", { name: "Meghirdetem fix áron" }));
    await waitFor(() => expect(auctionMocks.createAuction).toHaveBeenCalledWith(expect.objectContaining({
      vault_trade_card_id: 14,
      vault_collection_card_id: null,
      vault_quantity: 1,
    })));
  });
});
