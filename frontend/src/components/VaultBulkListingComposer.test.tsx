import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicTradeCard, VaultCard } from "../api/vault";
import { VaultBulkListingComposer } from "./VaultBulkListingComposer";

const auctionMocks = vi.hoisted(() => ({ createFixedListingBatch: vi.fn(), uploadAuctionImage: vi.fn() }));
const vaultMocks = vi.hoisted(() => ({ getHkkMarketPriceSuggestion: vi.fn() }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), ...auctionMocks }));
vi.mock("../api/vault", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/vault")>()), ...vaultMocks }));

const cards = [1, 2, 3].map((id) => ({ id, external_card_id: `hkk-${id}`, card_name: `Tesztlap ${id}`, image_url: null, edition: "Teszt", card_type: "Lény", subtype: null, color: null, rarity: "rare", quantity: 3, folder_id: 1, wanted: false, wanted_quantity: 0, offer_count: 0, print_variant: "normal" as const, in_trade: true, trade_card_id: id + 10 })) satisfies VaultCard[];
const trades = cards.map((card) => ({ ...card, id: card.id + 10, owner_id: 7, owner_username: "elado", seeker_count: 0 })) satisfies PublicTradeCard[];

describe("Vault tömeges hirdetés", () => {
  beforeEach(() => { vi.clearAllMocks(); auctionMocks.createFixedListingBatch.mockResolvedValue({ mode: "individual", auctions: [{ id: 101 }, { id: 102 }, { id: 103 }] }); vaultMocks.getHkkMarketPriceSuggestion.mockResolvedValue({ recommended_price: 350, minimum_price: 300, maximum_price: 400, offer_count: 3 }); });

  it("három lap árát, kedvezményét és kézi felülírását egyetlen kötegben véglegesíti", async () => {
    const onDone = vi.fn();
    render(<VaultBulkListingComposer tradeCards={trades} onDone={onDone}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laponkénti eladás" }));
    screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));
    for (const card of cards) fireEvent.change(screen.getByLabelText(`${card.card_name} kiindulási ár`), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Kedvezmény százalék"), { target: { value: "20" } });
    expect(screen.getAllByDisplayValue("800")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Tesztlap 1 végleges ár"), { target: { value: "750" } });
    fireEvent.change(screen.getByLabelText("Kedvezmény százalék"), { target: { value: "10" } });
    expect(screen.getByLabelText("Tesztlap 1 végleges ár")).toHaveValue(750);
    expect(screen.getAllByDisplayValue("900")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Lapok véglegesítése" }));
    expect(screen.getByRole("dialog", { name: "Véglegesítési előnézet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Meghirdetem" }));
    await waitFor(() => expect(auctionMocks.createFixedListingBatch).toHaveBeenCalledWith(expect.objectContaining({ mode: "individual", discount_percent: 10, items: expect.arrayContaining([expect.objectContaining({ final_price: 750 })]) })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Véglegesítési előnézet" })).not.toBeInTheDocument();
    expect(auctionMocks.createFixedListingBatch).toHaveBeenCalledWith(expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ vault_trade_card_id: trades[0].id })]) }));
  });

  it("adatvesztési figyelmeztetést mutat a két eladási mód közötti váltáskor", () => {
    render(<VaultBulkListingComposer tradeCards={trades} onDone={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laponkénti eladás" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Csoportos eladás" }));
    expect(screen.getByRole("dialog", { name: "Eladási mód váltása" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mégse" }));
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });

  it("a cseremappa teljes készletét választhatóvá és az ajánlott árat láthatóvá teszi", async () => {
    render(<VaultBulkListingComposer tradeCards={trades} onDone={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laponkénti eladás" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByLabelText("Tesztlap 1 darabszám").querySelectorAll("option")).toHaveLength(3);
    await waitFor(() => expect(screen.getByText("Ajánlott ár: 350 Ft")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Árfigyelő" })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("sikertelen véglegesítés után bezárja az előnézetet és kiírja a hibát", async () => {
    auctionMocks.createFixedListingBatch.mockRejectedValueOnce(new Error("A köteg nem véglegesíthető."));
    render(<VaultBulkListingComposer tradeCards={[trades[0]]} onDone={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laponkénti eladás" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Tesztlap 1 kiindulási ár"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lapok véglegesítése" }));
    fireEvent.click(screen.getByRole("button", { name: "Meghirdetem" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Véglegesítési előnézet" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("A köteg nem véglegesíthető.");
  });
});
