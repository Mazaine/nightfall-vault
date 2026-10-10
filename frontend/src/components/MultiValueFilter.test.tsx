import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiValueFilter, normalizeFilterText } from "./MultiValueFilter";

describe("MultiValueFilter", () => {
  it("ékezet- és kisbetűfüggetlenül keres", () => {
    expect(normalizeFilterText("  SZÖRNY  ")).toBe("szorny");
    const change = vi.fn();
    render(<MultiValueFilter label="Típus" options={[{ value: "Szörny" }, { value: "Bűbáj" }]} selected={[]} onChange={change}/>);
    const input = screen.getByRole("combobox", { name: "Típus" });
    fireEvent.change(input, { target: { value: "szorny" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(change).toHaveBeenCalledWith(["Szörny"]);
  });

  it("billentyűzettel navigál és üres keresőnél Backspace-szel eltávolítja az utolsó címkét", () => {
    const change = vi.fn();
    render(<MultiValueFilter label="Szín" options={[{ value: "Fairlight" }, { value: "Tharr" }]} selected={["Fairlight"]} onChange={change}/>);
    const input = screen.getByRole("combobox", { name: "Szín" });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(change).toHaveBeenCalledWith([]);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
