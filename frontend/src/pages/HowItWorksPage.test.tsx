import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { HowItWorksPage } from "./HowItWorksPage";

describe("HowItWorksPage", () => {
  it("közérthetően felsorolja a gyorslicit, az egyedi licit és a villámár szabályait", () => {
    render(<MemoryRouter><HowItWorksPage /></MemoryRouter>);

    const rules = screen.getByRole("region", { name: "Licitálási szabályok" });
    expect(within(rules).getByText(/A kártya Licitálok gombja ezt az összeget küldi be oldalváltás nélkül/)).toBeInTheDocument();
    expect(within(rules).getByText(/Egyedi, magasabb összeg csak egész licitlépcsőkkel adható meg/)).toBeInTheDocument();
    expect(screen.getByText(/Ha egy szabályos licit eléri a villámár összegét, az aukció azonnal Eladott állapotba kerül/)).toBeInTheDocument();
  });
});
