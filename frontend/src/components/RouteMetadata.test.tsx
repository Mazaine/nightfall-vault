import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RouteMetadata } from "./RouteMetadata";

function renderAt(pathname: string) {
  return render(<MemoryRouter initialEntries={[pathname]}><RouteMetadata /></MemoryRouter>);
}

describe("RouteMetadata", () => {
  it("publikus oldalon magyar címet és indexelhető metaadatot állít be", async () => {
    renderAt("/auctions");
    await waitFor(() => expect(document.title).toBe("Aukciók | Nightfall Vault"));
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toMatch(/\/auctions$/);
    expect(document.head.querySelector('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  });

  it("ismeretlen és privát oldalt nem enged indexelni", async () => {
    const view = renderAt("/valami-ismeretlen");
    await waitFor(() => expect(document.title).toBe("Az oldal nem található | Nightfall Vault"));
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    view.unmount();
    renderAt("/account/profile");
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow"));
  });
});
