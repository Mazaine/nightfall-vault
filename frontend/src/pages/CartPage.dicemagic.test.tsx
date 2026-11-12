import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartPage } from "./CartPage";
import type { CartItem } from "../api/cart";
import { ApiError } from "../api/client";

const mocks = vi.hoisted(() => ({ get: vi.fn(), checkout: vi.fn(), add: vi.fn(), remove: vi.fn(), update: vi.fn(), permission: vi.fn(), send: vi.fn() }));
vi.mock("../api/cart", async original => ({ ...(await original<typeof import("../api/cart")>()), getCart: mocks.get, checkoutCart: mocks.checkout, addCartItem: mocks.add, removeCartItem: mocks.remove, updateCartItem: mocks.update, getShopOrderPermission: mocks.permission, sendShopOrder: mocks.send }));
const shop: CartItem = { id: 1, auction_id: 11, title: "Bolti lap", seller_id: 10, seller_name: "DiceMagic", shop_source: "dicemagic", listing_format: "single", variant: "normal", quantity: 2, max_quantity: 999, unit_price: "390", current_price: "390", subtotal: "780", price_changed: false, state: "available", reservation_expires_at: null, image_url: null, external_card_id: null, bundle_items: [] };
const privateItem: CartItem = { ...shop, id: 2, auction_id: 12, shop_source: null, title: "Magáneladós lap", seller_id: 20, seller_name: "Anna", max_quantity: 3 };
const cart = { items: [shop, privateItem], total: "1560", item_count: 2, server_time: new Date().toISOString() };
const order = { id: 1, external_order_id: "NV-fixture", status: "queued", total: 780, items: [{ outer_id: "fixture-card", name: "Bolti lap", quantity: 2, line_total_huf: 780 }] };
const pending = { status: "partial", transaction_count: 1, seller_count: 1, item_count: 1, total: "780", transactions: [], external_orders: [order] };
const completed = { ...pending, status: "completed", transaction_count: 2, seller_count: 2, item_count: 2, total: "1560", external_orders: [{ ...order, status: "accepted", transaction_id: 4 }] };

function fillShopDetails() {
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Teljes név"), { target: { value: "Fixture Buyer" } });
  fireEvent.change(dialog.getByLabelText("E-mail"), { target: { value: "fixture@example.com" } });
  fireEvent.change(dialog.getByLabelText("Irányítószám"), { target: { value: "1111" } });
  fireEvent.change(dialog.getByLabelText("Település"), { target: { value: "Fixture" } });
  fireEvent.change(dialog.getByLabelText("Utca, házszám"), { target: { value: "Fixture 1" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: /Jóváhagyom/ }));
}

describe("DiceMagic ordering directly from the cart", () => {
  beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear();
    mocks.get.mockResolvedValue(cart); mocks.add.mockResolvedValue(cart);
    mocks.permission.mockResolvedValue({ enabled: true, orders_enabled: true, order_environment_enabled: true });
    mocks.send.mockResolvedValue({ ...order, status: "accepted", transaction_id: 4 });
    mocks.checkout.mockReset().mockResolvedValueOnce(pending).mockResolvedValue(completed);
  });
  it("a 999-es bolti mennyiség a bolti végpontot használja", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    const quantity = await screen.findByLabelText("Bolti lap darabszáma");
    expect(quantity).toHaveTextContent("999");
    fireEvent.change(quantity, { target: { value: "999" } });
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith(11, 999, true));
    expect(screen.getByLabelText("Magáneladós lap darabszáma").querySelectorAll("option")).toHaveLength(3);
  });
  it("egyetlen Megrendelem művelet kezeli a vegyes kosarat, adminoldali navigáció nélkül", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Véglegesítés" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("DiceMagic");
    expect(screen.getByRole("dialog")).toHaveTextContent("Anna");
    expect(screen.queryByRole("button", { name: "Bolti adatok ellenőrzése" })).not.toBeInTheDocument();
    fillShopDetails();
    fireEvent.click(screen.getByRole("button", { name: "Megrendelem" }));
    expect(await screen.findByRole("heading", { name: "Sikeres véglegesítés" })).toBeInTheDocument();
    expect(mocks.checkout).toHaveBeenNthCalledWith(1, expect.any(String), [1, 2], expect.objectContaining({ buyer: expect.objectContaining({ full_name: "Fixture Buyer" }), consent_data_transfer: true }), true);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.checkout.mock.calls[1][0]).toBe(mocks.checkout.mock.calls[0][0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/admin/integrations/dicemagic"]')).toBeNull();
    expect(sessionStorage.getItem("nightfall-mixed-checkout-key")).toBeNull();
  });
  it("visszatöltés és állapotfrissítés önmagában soha nem küld valódi rendelést", async () => {
    mocks.get.mockResolvedValue({ ...cart, items: [{ ...shop, state: "order_pending" }], checkout_resume_key: "stable-fixture-key" });
    mocks.checkout.mockReset().mockResolvedValue(pending);
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    expect(await screen.findByLabelText("Bolti lap darabszáma")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Rendelés folytatása" }));
    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledWith("stable-fixture-key", [1], undefined, true));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getAllByText(/Bolti lap/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Megrendelem" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Vissza a kosárhoz" }));
    fireEvent.click(screen.getByRole("button", { name: "Rendelés állapotának frissítése" }));
    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledTimes(2));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
  });
  it("egy másik függő rendelés nem írja felül a folyamatban lévő rendelés kulcsát", async () => {
    sessionStorage.setItem("nightfall-mixed-checkout-key", "existing-order-key");
    mocks.get.mockResolvedValue({ ...cart, items: [{ ...shop, state: "order_pending" }], checkout_resume_key: "another-order-key" });
    mocks.checkout.mockReset().mockResolvedValue(pending);
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Rendelés folytatása" }));
    await screen.findByRole("dialog");
    expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith("existing-order-key", [1], undefined, true);
    expect(sessionStorage.getItem("nightfall-mixed-checkout-key")).toBe("existing-order-key");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("a kötelező adatokat és hozzájárulást az egyetlen rendelőgomb is megköveteli", async () => {
    const booster = { ...shop, title: "Zén Legendái: Varázslatok", quantity: 1, unit_price: "690", subtotal: "690", current_price: "690" };
    mocks.get.mockResolvedValue({ ...cart, items: [booster], item_count: 1, total: "690" });
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Véglegesítés" }));
    fireEvent.click(screen.getByRole("button", { name: "Megrendelem" }));
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    fillShopDetails();
    fireEvent.change(screen.getByLabelText("Település"), { target: { value: "Changed Fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Megrendelem" }));
    expect(await screen.findByRole("heading", { name: "Sikeres véglegesítés" })).toBeInTheDocument();
    expect(mocks.checkout.mock.calls[0][2].billing.address.city).toBe("Changed Fixture");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it.each(["enabled", "orders_enabled", "order_environment_enabled"])("a letiltott %s kaput nem kapcsolja át, és helyi rendelést sem készít", async gate => {
    mocks.permission.mockResolvedValue({ enabled: true, orders_enabled: true, order_environment_enabled: true, [gate]: false });
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Véglegesítés" }));
    fillShopDetails();
    fireEvent.click(screen.getByRole("button", { name: "Megrendelem" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("nincs engedélyezve");
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("nightfall-mixed-checkout-key")).toBeNull();
  });
  it("a küldés hálózati hibája után ugyanazt a rendelést lehet tudatosan újrapróbálni", async () => {
    mocks.checkout.mockReset().mockResolvedValueOnce(pending).mockResolvedValueOnce(pending).mockResolvedValue(completed);
    mocks.send.mockReset().mockRejectedValueOnce(new ApiError("Átmeneti hiba", 503)).mockResolvedValue({ ...order, status: "accepted" });
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Véglegesítés" }));
    fillShopDetails();
    fireEvent.click(screen.getByRole("button", { name: "Megrendelem" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Átmeneti hiba");
    const key = mocks.checkout.mock.calls[0][0];
    expect(sessionStorage.getItem("nightfall-mixed-checkout-key")).toBe(key);
    expect(screen.getByRole("button", { name: "Megrendelem" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ellenőriztem a tételeket/ }));
    fireEvent.click(screen.getByRole("button", { name: "Megrendelem" }));
    expect(await screen.findByRole("heading", { name: "Sikeres véglegesítés" })).toBeInTheDocument();
    expect(mocks.send.mock.calls).toEqual([[1], [1]]);
    expect(mocks.checkout.mock.calls.every(call => call[0] === key)).toBe(true);
  });
  it("bizonytalan bolti eredményt nem mutat sikernek és nem próbál újra automatikusan", async () => {
    const unknown = { ...pending, external_orders: [{ ...order, status: "unknown" }] };
    mocks.checkout.mockReset().mockResolvedValueOnce(pending).mockResolvedValue(unknown);
    mocks.send.mockResolvedValue({ ...order, status: "unknown" });
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Véglegesítés" }));
    fillShopDetails();
    fireEvent.click(screen.getByRole("button", { name: "Megrendelem" }));
    expect(await screen.findByRole("heading", { name: "A rendelés még nincs teljesen visszaigazolva" })).toBeInTheDocument();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Rendelés állapotának frissítése" }));
    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledTimes(3));
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("a régi hibás klienskulcsnál adatlapot kér, és nem küld el semmit", async () => {
    sessionStorage.setItem("nightfall-mixed-checkout-key", "rejected-fixture-key");
    mocks.checkout.mockReset().mockRejectedValue(new ApiError("A bolti rendeléshez vásárlási adatlap szükséges.", 422));
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Rendelés folytatása" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("adatlap");
    expect(sessionStorage.getItem("nightfall-mixed-checkout-key")).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("a Mégsem/Vissza művelet sem előkészítést, sem küldést nem indít", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Véglegesítés" }));
    fireEvent.click(screen.getByRole("button", { name: "Vissza a kosárhoz" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
