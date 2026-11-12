import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { DiceMagicCheckout } from "./DiceMagicCheckout";
import type { CartItem } from "../api/cart";

describe("DiceMagicCheckout", () => {
  it("nem kér bolti személyes adatokat magáneladós kosárhoz", () => {
    render(<MemoryRouter><DiceMagicCheckout items={[]} /></MemoryRouter>);
    expect(screen.queryByText("DiceMagic bolti rendelés")).not.toBeInTheDocument();
  });
  it("normál rendelés az alapérték, a tesztjelölő külön figyelmeztetést ad", () => {
    render(<MemoryRouter><DiceMagicCheckout items={[{ id: 1 } as CartItem]} /></MemoryRouter>);
    const toggle = screen.getByRole("checkbox", { name: "Tesztrendelés" });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole("note")).toHaveTextContent("valódi rendelést hoz létre");
    expect(screen.getByLabelText("Irányítószám")).toBeRequired();
  });
});
