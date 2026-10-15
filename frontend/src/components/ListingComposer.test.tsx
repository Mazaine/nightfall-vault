import { MemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildHkkMarketPriceUrl, ListingComposer, type ListingSource } from "./ListingComposer";

vi.mock("../api/vault", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/vault")>()),
  getHkkMarketPriceSuggestion: vi.fn().mockResolvedValue({ recommended_price: 350, minimum_price: 300, maximum_price: 400, offer_count: 2 }),
}));

const source: ListingSource = {
  externalCardId: "9888",
  cardName: "Ősi áldozat",
  edition: "Roxat céhei",
  imageUrl: null,
  variants: [{ id: 14, print_variant: "normal", quantity: 2 }],
};

describe("ListingComposer piaci ár hivatkozás", () => {
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
});
