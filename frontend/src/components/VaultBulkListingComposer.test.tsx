import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicTradeCard, VaultCard } from "../api/vault";
import { VaultBulkListingComposer } from "./VaultBulkListingComposer";

const auctionMocks = vi.hoisted(() => ({ createFixedListingBatch: vi.fn(), uploadAuctionImage: vi.fn() }));
vi.mock("../api/auctions", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auctions")>()), ...auctionMocks }));

const cards = [1, 2, 3].map((id) => ({ id, external_card_id: `hkk-${id}`, card_name: `Tesztlap ${id}`, image_url: null, edition: "Teszt", card_type: "Lény", subtype: null, color: null, rarity: "rare", quantity: 3, folder_id: 1, wanted: false, wanted_quantity: 0, offer_count: 0, print_variant: "normal" as const, in_trade: true, trade_card_id: id + 10 })) satisfies VaultCard[];
const trades = cards.map((card) => ({ ...card, id: card.id + 10, owner_id: 7, owner_username: "elado", seeker_count: 0 })) satisfies PublicTradeCard[];

describe("Vault tömeges hirdetés", () => {
  beforeEach(() => { vi.clearAllMocks(); auctionMocks.createFixedListingBatch.mockResolvedValue({ mode: "individual", auctions: [{ id: 101 }, { id: 102 }, { id: 103 }] }); });

  it("három lap árát, kedvezményét és kézi felülírását egyetlen kötegben véglegesíti", async () => {
    const onDone = vi.fn();
    render(<VaultBulkListingComposer tradeCards={trades} collectionCards={cards} onDone={onDone}/>);
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
    expect(onDone).toHaveBeenCalled();
  });

  it("adatvesztési figyelmeztetést mutat a két eladási mód közötti váltáskor", () => {
    render(<VaultBulkListingComposer tradeCards={trades} collectionCards={cards} onDone={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Laponkénti eladás" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Csoportos eladás" }));
    expect(screen.getByRole("dialog", { name: "Eladási mód váltása" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mégse" }));
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });
});
