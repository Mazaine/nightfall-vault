import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportDialog } from "./ReportDialog";

const reasons = [{ value: "other", label: "Egyéb" }];

describe("ReportDialog", () => {
  it("valódi modálként jelenik meg, a bezárásra helyezi a fókuszt és Escape-re bezár", () => {
    const onClose = vi.fn();
    render(<ReportDialog title="Aukció jelentése" targetLabel="Teszt aukció" reasons={reasons} onSubmit={vi.fn()} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Aukció jelentése" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Bezárás" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a fókuszt a modálon belül tartja", () => {
    render(<ReportDialog title="Profil jelentése" targetLabel="Teszt felhasználó" reasons={reasons} onSubmit={vi.fn()} onClose={vi.fn()} />);
    const close = screen.getByRole("button", { name: "Bezárás" });
    const submit = screen.getByRole("button", { name: "Jelentés beküldése" });

    close.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(submit).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(close).toHaveFocus();
  });
});
