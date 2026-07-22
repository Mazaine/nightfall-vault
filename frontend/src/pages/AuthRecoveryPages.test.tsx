import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./AuthRecoveryPages";

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
}));

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auth")>()),
  resetPassword: mocks.resetPassword,
}));

describe("ResetPasswordPage", () => {
  it("billentyűzettel kapcsolja a jelszót és magyarul jelzi a lejárt linket", async () => {
    mocks.resetPassword.mockRejectedValueOnce(new Error("A jelszó-visszaállító link lejárt."));
    render(<MemoryRouter initialEntries={["/reset-password?token=expired-token"]}><ResetPasswordPage /></MemoryRouter>);

    const password = screen.getByLabelText("Új jelszó", { selector: "input" });
    const confirmation = screen.getByLabelText("Új jelszó megerősítése");
    fireEvent.keyDown(screen.getByRole("button", { name: "Jelszó megjelenítése" }), { key: "Enter" });
    expect(password).toHaveAttribute("type", "text");

    fireEvent.change(password, { target: { value: "ExpiredPassword123!" } });
    fireEvent.change(confirmation, { target: { value: "ExpiredPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Új jelszó mentése" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("A jelszó-visszaállító link lejárt."));
  });
});
