import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { HomeHero } from "./HomeHero";
import { HomeQuickLinks } from "./HomeQuickLinks";

function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{location.pathname + location.search}</output>;
}

describe("Főoldal felfedezés", () => {
  it("a keresés a fix áras lapok találatait nyitja meg", () => {
    render(<MemoryRouter><Routes><Route path="/" element={<HomeHero />} /><Route path="/marketplace" element={<Destination />} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  Jégcsap  " } });
    fireEvent.click(screen.getByRole("button", { name: "Keresés" }));
    expect(screen.getByTestId("destination")).toHaveTextContent("/marketplace?tab=cards&q=J%C3%A9gcsap");
  });

  it("a négy gyors elérés a megfelelő működő útvonalra mutat", () => {
    render(<MemoryRouter><HomeQuickLinks /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Lapok/ })).toHaveAttribute("href", "/marketplace?tab=cards");
    expect(screen.getByRole("link", { name: /Aukciók/ })).toHaveAttribute("href", "/marketplace?tab=auctions");
    expect(screen.getByRole("link", { name: /Csere/ })).toHaveAttribute("href", "/vault/community");
    expect(screen.getByRole("link", { name: /Virtuális mappa/ })).toHaveAttribute("href", "/vault");
  });
});
