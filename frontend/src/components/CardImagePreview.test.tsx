import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardImagePreview } from "./CardImagePreview";

describe("CardImagePreview", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rövid késleltetéssel megmutatja, majd a kép elhagyásakor eltünteti a nagyított előnézetet", () => {
    vi.useFakeTimers();
    render(<CardImagePreview card={{ external_card_id: "123", card_name: "Tesztlap", image_url: "https://example.invalid/card.jpg" }} />);
    const thumbnail = screen.getByRole("img", { name: "Tesztlap" });
    const anchor = thumbnail.parentElement!;
    fireEvent.pointerEnter(anchor);
    act(() => vi.advanceTimersByTime(119));
    expect(screen.queryByRole("img", { name: "Tesztlap nagyított képe" })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("img", { name: "Tesztlap nagyított képe" })).toBeInTheDocument();
    fireEvent.pointerLeave(anchor);
    act(() => vi.advanceTimersByTime(70));
    expect(screen.queryByRole("img", { name: "Tesztlap nagyított képe" })).not.toBeInTheDocument();
  });
});
