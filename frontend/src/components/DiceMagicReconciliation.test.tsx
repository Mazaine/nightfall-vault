import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DiceMagicReconciliation } from "./DiceMagicReconciliation";
const request = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ apiRequest: request }));
const review = { order_id: 4, order_status: "accepted", holds: [{ id: 5, outer_id: "fixture", quantity: 2, baseline_stock: 3, stock: 1, generated_at: "2026-11-11", snapshot_token: "a".repeat(64), resolved_at: null, effective_stock: 0 }] };
beforeEach(() => { request.mockReset(); request.mockResolvedValue(review); });
it("a készletet nem engedi kézzel átírni, a pontos snapshotot és bizonyítékot küldi", async () => {
  render(<DiceMagicReconciliation orderId={4} />);
  fireEvent.click(screen.getByRole("button", { name: "Készlet egyeztetése / frissítése" }));
  const reference = await screen.findByLabelText("Partneri visszaigazolás / egyeztetés hivatkozása");
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  fireEvent.change(reference, { target: { value: "Partner verified fixture" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Ellenőrzött blokk feloldása" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("/api/admin/integrations/dicemagic/orders/4/holds/5/reconcile", { method: "POST", body: JSON.stringify({ partner_status: "accepted", partner_reference: "Partner verified fixture", verified_stock: 1, snapshot_token: "a".repeat(64), confirm_verified: true }) }));
});
