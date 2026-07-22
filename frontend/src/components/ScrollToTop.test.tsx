import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToTop } from "./ScrollToTop";

describe("ScrollToTop", () => {
  afterEach(() => vi.restoreAllMocks());

  it("útvonalváltáskor a lap tetejére görget", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={["/first"]}>
        <ScrollToTop />
        <Link to="/second">Következő oldal</Link>
        <Routes><Route path="*" element={null} /></Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("link", { name: "Következő oldal" }));
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" }));
    expect(scrollTo.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
