import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDiceMagicPage } from "./AdminDiceMagicPage";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", () => ({ apiRequest: request }));
const order = { id: 4, external_order_id: "NV-fixture", status: "queued", total: 780, transaction_id: null, error: null, shop_order_id: null, items: [{ outer_id: "fixture", name: "Bolti lap", quantity: 2, unit_price_huf: 390, line_total_huf: 780 }] };
describe("AdminDiceMagicPage", () => {
  beforeEach(() => { request.mockReset(); request.mockImplementation((path: string, options?: { method: string }) => {
    if (options?.method === "POST") return Promise.resolve({ status: "unknown" });
    if (path.endsWith("/orders")) return Promise.resolve([order]);
    return Promise.resolve({ enabled: true, client_id_configured: true, secret_configured: true, sync_enabled: false, orders_enabled: true, order_environment_enabled: true, summary: {} });
  }); });
  it("a tételes végső modal külön jóváhagyás nélkül nem küld rendelést", async () => {
    render(<MemoryRouter><AdminDiceMagicPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Rendelés ellenőrzése és külön elküldése" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Bolti lap");
    expect(screen.getByRole("dialog")).toHaveTextContent("780 Ft");
    expect(screen.getByRole("button", { name: "Valódi rendelés elküldése" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mégsem" }));
    expect(request.mock.calls.some(call => String(call[0]).endsWith("/send"))).toBe(false);
  });
  it("a külön jóváhagyás után az admin küldési végpontot hívja, az unknown eredményt jelzi", async () => {
    render(<MemoryRouter><AdminDiceMagicPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Rendelés ellenőrzése és külön elküldése" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Ellenőriztem a tételeket/ }));
    fireEvent.click(screen.getByRole("button", { name: "Valódi rendelés elküldése" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/admin/integrations/dicemagic/orders/4/send", { method: "POST", body: JSON.stringify({ confirm_real_order: true }) }));
    expect(await screen.findByRole("status")).toHaveTextContent("Bizonytalan eredmény");
  });
});
