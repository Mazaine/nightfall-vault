import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DiceMagicPrivacy } from "./DiceMagicPrivacy";
const request = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ apiRequest: request }));
beforeEach(() => request.mockReset());

it("szabályzat nélkül csak előnézetet kínál, adatot nem töröl", async () => {
  request.mockResolvedValue({ policy_approved: false, retention_days: null, items: [] });
  render(<DiceMagicPrivacy />);
  fireEvent.click(screen.getByText("Bolti rendelési adatok megőrzése"));
  fireEvent.click(screen.getByRole("button", { name: "Anonimizálási előnézet" }));
  expect(await screen.findByText(/Az adattörlés tiltott/)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledExactlyOnceWith("/api/admin/integrations/dicemagic/privacy/preview");
});

it("csak jóváhagyás után a konkrét előnézet tokenjeivel anonimizál", async () => {
  request.mockResolvedValueOnce({ policy_approved: true, retention_days: 90, items: [{ id: 5, status: "rejected", token: "fixture-token" }] }).mockResolvedValueOnce({ anonymized_count: 1 });
  render(<DiceMagicPrivacy />);
  fireEvent.click(screen.getByText("Bolti rendelési adatok megőrzése"));
  fireEvent.click(screen.getByRole("button", { name: "Anonimizálási előnézet" }));
  const apply = await screen.findByRole("button", { name: "Személyes adatok végleges eltávolítása" });
  expect(apply).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(apply);
  expect(await screen.findByRole("status")).toHaveTextContent("1 rendelés személyes adatai eltávolítva");
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ expected: { "5": "fixture-token" }, confirmed: true });
});

it("hibánál megőrzi az előnézetet és új megerősítést követel", async () => {
  request.mockResolvedValueOnce({ policy_approved: true, retention_days: 90, items: [{ id: 5, status: "rejected", token: "fixture-token" }] }).mockRejectedValueOnce(new Error("Az előnézet megváltozott."));
  render(<DiceMagicPrivacy />);
  fireEvent.click(screen.getByText("Bolti rendelési adatok megőrzése"));
  fireEvent.click(screen.getByRole("button", { name: "Anonimizálási előnézet" }));
  const apply = await screen.findByRole("button", { name: "Személyes adatok végleges eltávolítása" });
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(apply);
  expect(await screen.findByRole("status")).toHaveTextContent("Az előnézet megváltozott");
  await waitFor(() => expect(apply).toBeDisabled());
});
