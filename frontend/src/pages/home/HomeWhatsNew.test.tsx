import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { HomeWhatsNew } from "./HomeWhatsNew";

describe("HomeWhatsNew", () => {
  it("a központi frissítési tartalmat és dokumentációs linket jeleníti meg", () => {
    render(<MemoryRouter><HomeWhatsNew /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Legújabb frissítés" })).toBeInTheDocument();
    expect(screen.getByText(/megerősítést kérhetsz/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /részletek/i })).toHaveAttribute("href", "/how-it-works#bid-withdrawal");
  });
});
