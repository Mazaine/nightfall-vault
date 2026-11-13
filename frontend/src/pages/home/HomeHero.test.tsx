import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { HomeHero } from "./HomeHero";
import { HomeQuickLinks } from "./HomeQuickLinks";

describe("Főoldal felfedezés", () => {
  it("a nyitóblokkban nincs külön kereső, a meglévő gombok megmaradnak", () => {
    render(<MemoryRouter><HomeHero /></MemoryRouter>);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lapok böngészése" })).toHaveAttribute("href", "/marketplace?tab=cards");
    expect(screen.getByRole("link", { name: "Virtuális mappám" })).toHaveAttribute("href", "/vault");
  });

  it("a négy gyors elérés a megfelelő működő útvonalra mutat", () => {
    render(<MemoryRouter><HomeQuickLinks /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Lapok/ })).toHaveAttribute("href", "/marketplace?tab=cards");
    expect(screen.getByRole("link", { name: /Aukciók/ })).toHaveAttribute("href", "/marketplace?tab=auctions");
    expect(screen.getByRole("link", { name: /Csere/ })).toHaveAttribute("href", "/vault/community");
    expect(screen.getByRole("link", { name: /Virtuális mappa/ })).toHaveAttribute("href", "/vault");
  });
});
