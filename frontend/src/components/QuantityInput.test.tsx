import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QuantityInput } from "./QuantityInput";
it("nagy készletnél a beírt mennyiséget csak érvényes, befejezett szerkesztés után küldi", () => {
  const change = vi.fn();
  render(<QuantityInput value={1} max={150} label="Darabszám" onChange={change} />);
  const input = screen.getByRole("spinbutton", { name: "Darabszám" });
  fireEvent.change(input, { target: { value: "20" } }); expect(change).not.toHaveBeenCalled();
  fireEvent.blur(input); expect(change).toHaveBeenCalledWith(20);
  change.mockClear(); fireEvent.change(input, { target: { value: "151" } }); fireEvent.blur(input); expect(change).not.toHaveBeenCalled();
  expect(input).toHaveValue(1);
});
