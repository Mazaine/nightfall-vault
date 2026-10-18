import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartPage } from "./CartPage";

const mocks = vi.hoisted(() => ({ getCart: vi.fn(), update: vi.fn(), remove: vi.fn(), renew: vi.fn(), checkout: vi.fn(), announce: vi.fn() }));
vi.mock("../api/cart", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/cart")>()), getCart: mocks.getCart, updateCartItem: mocks.update, removeCartItem: mocks.remove, renewCartItem: mocks.renew, checkoutCart: mocks.checkout, announceCartChanged: mocks.announce }));

const cart = { server_time: new Date().toISOString(), item_count: 2, total: "3600.00", items: [
  { id: 1, auction_id: 11, title: "Első lap", seller_id: 3, seller_name: "Anna", listing_format: "single" as const, variant: "normal", quantity: 2, max_quantity: 3, unit_price: "1200.00", current_price: "1200.00", subtotal: "2400.00", price_changed: false, state: "reserved" as const, reservation_expires_at: new Date(Date.now() + 60_000).toISOString(), image_url: null, external_card_id: "111", bundle_items: [] },
  { id: 2, auction_id: 12, title: "Csomag", seller_id: 4, seller_name: "Béla", listing_format: "bundle" as const, variant: null, quantity: 1, max_quantity: 1, unit_price: "1200.00", current_price: "1200.00", subtotal: "1200.00", price_changed: false, state: "expired" as const, reservation_expires_at: "2026-10-17T09:00:00Z", image_url: null, external_card_id: null, bundle_items: [{ card_name: "Lap", quantity: 1, external_card_id: "1", image_url: null }] },
] };

describe("CartPage", () => {
  beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); mocks.getCart.mockResolvedValue(cart); mocks.update.mockResolvedValue(cart); mocks.remove.mockResolvedValue(cart); mocks.renew.mockResolvedValue({ ...cart, items: cart.items.map((item) => ({ ...item, state: "reserved" })) }); mocks.checkout.mockResolvedValue({ checkout_batch_id: 1, transaction_count: 2, seller_count: 2, item_count: 2, total: "3600.00", transactions: [] }); });
  it("mutatja a foglalási állapotokat, a csomagot és az eladónkénti előnézetet", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Kosár" })).toBeInTheDocument();
    expect(screen.getByText("Lefoglalva")).toBeInTheDocument();
    expect(screen.getByText("Foglalás lejárt")).toBeInTheDocument();
    expect(screen.getByText("Csomag · 1 különböző lap")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Újrafoglalás" }));
    await waitFor(() => expect(mocks.renew).toHaveBeenCalledWith(2));
    fireEvent.click(screen.getByRole("button", { name: "Véglegesítés" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Anna");
    expect(screen.getByRole("dialog")).toHaveTextContent("Béla");
    expect(screen.getByRole("dialog")).toHaveTextContent("Nincs online fizetés");
  });

  it("szerveroldali frissítést kér mennyiségváltáskor, és a csomagot nem bontja meg", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    const single = await screen.findByLabelText("Első lap darabszáma");
    fireEvent.change(single, { target: { value: "3" } });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(1, 3));
    expect(screen.getByLabelText("Csomag darabszáma")).toBeDisabled();
  });

  it("magasabb árat külön elfogadtat és az elfogyott tételt nem engedi véglegesíteni", async () => {
    mocks.getCart.mockResolvedValueOnce({ ...cart, items: [
      { ...cart.items[0], price_changed: true, current_price: "1500.00" },
      { ...cart.items[1], state: "unavailable" },
    ] });
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    const accept = await screen.findByRole("button", { name: /Új ár elfogadása/ });
    expect(screen.getByRole("button", { name: "Véglegesítés" })).toBeDisabled();
    expect(screen.getByText("Már nem elérhető")).toBeInTheDocument();
    fireEvent.click(accept);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(1, 2, true));
  });

  it("sikeres véglegesítés után összesítőt és ügylet-linket mutat", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Véglegesítés" }));
    fireEvent.click(screen.getByRole("button", { name: "Vásárlási szándék véglegesítése" }));
    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("2 ügylet · 2 eladó · 2 tétel");
    expect(screen.getByRole("link", { name: "Ügyletek megnyitása" })).toHaveAttribute("href", "/account/transactions");
  });
});
