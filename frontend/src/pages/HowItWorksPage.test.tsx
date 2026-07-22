import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorksPage } from "./HowItWorksPage";

describe("HowItWorksPage", () => {
  it("közérthetően felsorolja a gyorslicit, az egyedi licit és a villámár szabályait", () => {
    render(<HowItWorksPage />);

    const rules = screen.getByRole("region", { name: "Licitálási szabályok" });
    expect(within(rules).getByText(/oldalváltás nélkül az aktuális licithez ad egy teljes licitlépcsőt/)).toBeInTheDocument();
    expect(within(rules).getByText(/A további emelés csak egész licitlépcsőkben történhet/)).toBeInTheDocument();
    expect(within(rules).getByText(/Sikeres művelet esetén a licitáló megnyeri az aukciót/)).toBeInTheDocument();
  });
});
