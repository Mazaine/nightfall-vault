import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { categories } from "../../data/content";
import { HomeCategories } from "./HomeCategories";

describe("HomeCategories", () => {
  it("minden kategóriát közvetlenül az aukciószűrőre irányít", () => {
    render(<MemoryRouter><HomeCategories /></MemoryRouter>);

    for (const category of categories) {
      expect(screen.getByRole("link", { name: category })).toHaveAttribute(
        "href",
        `/auctions?category=${encodeURIComponent(category)}`,
      );
    }
  });
});
