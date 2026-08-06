import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BidConfirmationDialog, BidWithdrawalDialog } from "./BidDialogs";

describe("BidDialogs", () => {
  it("csak a megerősítő művelet után adja át a normál licitet", () => {
    const confirm = vi.fn();
    render(<BidConfirmationDialog amountLabel="12 000 Ft" isBuyNow={false} busy={false} onClose={vi.fn()} onConfirm={confirm} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Licit megerősítése");
    fireEvent.click(screen.getByLabelText("Ne kérjen több megerősítést ezen az eszközön"));
    fireEvent.click(screen.getByRole("button", { name: "Licit véglegesítése" }));
    expect(confirm).toHaveBeenCalledWith(true);
  });

  it("a villámvásárlásnál nem engedi kikapcsolni a megerősítést", () => {
    render(<BidConfirmationDialog amountLabel="20 000 Ft" isBuyNow busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByLabelText("Ne kérjen több megerősítést ezen az eszközön")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Villámvásárlás véglegesítése" })).toBeInTheDocument();
  });

  it("Escape billentyűre bezár és helyreállítja az oldal görgetését", () => {
    const close = vi.fn();
    const { unmount } = render(<BidConfirmationDialog amountLabel="12 000 Ft" isBuyNow={false} busy={false} onClose={close} onConfirm={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("az egyéb visszavonási indokot magyarul validálja", () => {
    const confirm = vi.fn();
    render(<BidWithdrawalDialog busy={false} onClose={vi.fn()} onConfirm={confirm} />);
    fireEvent.change(screen.getByLabelText("Indok"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Részletes indok"), { target: { value: "rövid" } });
    fireEvent.click(screen.getByRole("button", { name: "Licit visszavonása" }));
    expect(screen.getByRole("alert")).toHaveTextContent("legalább 10 karakter");
    expect(confirm).not.toHaveBeenCalled();
  });
});
