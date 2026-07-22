import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReportDialog } from "./ReportDialog";

const reasons = [{ value: "other", label: "Egyéb" }];

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Aukció jelentése</button>
      {open ? (
        <ReportDialog
          title="Aukció jelentése"
          targetLabel="Teszt aukció"
          reasons={reasons}
          onSubmit={vi.fn()}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

describe("ReportDialog", () => {
  it("valódi modálként jelenik meg, a bezárásra helyezi a fókuszt és Escape-re bezár", () => {
    const onClose = vi.fn();
    render(<ReportDialog title="Aukció jelentése" targetLabel="Teszt aukció" reasons={reasons} onSubmit={vi.fn()} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Aukció jelentése" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Bezárás" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a fókuszt a modálon belül tartja Tab és Shift+Tab használatakor", () => {
    render(<ReportDialog title="Profil jelentése" targetLabel="Teszt felhasználó" reasons={reasons} onSubmit={vi.fn()} onClose={vi.fn()} />);
    const close = screen.getByRole("button", { name: "Bezárás" });
    const submit = screen.getByRole("button", { name: "Jelentés beküldése" });

    close.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(submit).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("háttérkattintásra bezár, visszaadja a fókuszt és helyreállítja a görgetést", () => {
    document.body.style.overflow = "auto";
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Aukció jelentése" });
    opener.focus();
    fireEvent.click(opener);

    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.mouseDown(screen.getByTestId("report-dialog-backdrop"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");
    expect(opener).toHaveFocus();
    document.body.style.overflow = "";
  });

  it("címkézi a mezőket és magyar sikerüzenetet ad", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ReportDialog title="Aukció jelentése" targetLabel="Teszt aukció" reasons={reasons} onSubmit={onSubmit} onClose={vi.fn()} />);

    expect(screen.getByLabelText("Jelentés oka")).toBeInTheDocument();
    expect(screen.getByLabelText("Részletek")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jelentés beküldése" }));

    expect(await screen.findByRole("status")).toHaveTextContent("A jelentés rögzítve. A moderátorok átnézik az ügyet.");
    expect(onSubmit).toHaveBeenCalledWith("other", "");
  });

  it("az ismételt jelentés backendüzenetét magyarul jeleníti meg", async () => {
    const duplicateMessage = "Ezt már korábban jelentetted. Ugyanazt az aukciót vagy felhasználót csak egyszer jelentheted.";
    render(<ReportDialog title="Profil jelentése" targetLabel="Teszt felhasználó" reasons={reasons} onSubmit={vi.fn().mockRejectedValue(new Error(duplicateMessage))} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Jelentés beküldése" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(duplicateMessage));
  });
});
