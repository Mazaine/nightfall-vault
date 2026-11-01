import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("közvetlenül elérhetővé teszi a Kapcsolat oldalt", () => {
    render(<MemoryRouter><SiteFooter /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Kapcsolat" })).toHaveAttribute("href", "/contact");
  });
});
