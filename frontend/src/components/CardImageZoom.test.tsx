import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardImageZoom } from "./CardImageZoom";

describe("CardImageZoom", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("nem jelenít meg nagyítót hiányzó képhez", () => {
    const { container } = render(<CardImageZoom src="" alt="Hiányzó lap" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("kattintásra modalt nyit, képet nagyít, és Esc-re bezár", () => {
    render(<CardImageZoom src="https://example.invalid/card.jpg" alt="Tesztlap" />);
    fireEvent.click(screen.getByRole("button", { name: "Lap nagyítása: Tesztlap" }));
    expect(screen.getByRole("dialog", { name: "Tesztlap" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tesztlap nagyított képe" })).toHaveAttribute("src", "https://example.invalid/card.jpg");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Nagyítás bezárása" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Nagyítás" }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nagyítás" }));
    expect(screen.getByText("200%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Visszaállítás" }));
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Lap nagyítása: Tesztlap" })).toHaveFocus();
  });

  it("nem indítja el a szülő kártya megnyitását", () => {
    let clicked = false;
    render(<div onClick={() => { clicked = true; }}><CardImageZoom src="https://example.invalid/card.jpg" alt="Tesztlap" /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Lap nagyítása: Tesztlap" }));
    expect(clicked).toBe(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nagyítás bezárása" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
