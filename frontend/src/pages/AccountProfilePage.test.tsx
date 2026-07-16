import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountProfilePage } from "./AccountProfilePage";

const mocks = vi.hoisted(() => ({ updateProfile: vi.fn(), deleteProfile: vi.fn(), refreshMe: vi.fn(), logout: vi.fn() }));
vi.mock("../api/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/auth")>()), updateProfile: mocks.updateProfile, deleteProfile: mocks.deleteProfile }));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ user: { id: 1, email: "anna@example.test", username: "anna", full_name: "Anna", role: "user" }, refreshMe: mocks.refreshMe, logout: mocks.logout }) }));
vi.mock("../components/NotificationPreferencesPanel", () => ({ NotificationPreferencesPanel: () => null }));

describe("AccountProfilePage", () => {
  beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); mocks.updateProfile.mockResolvedValue({}); mocks.refreshMe.mockResolvedValue({}); mocks.deleteProfile.mockResolvedValue({ message: "Törölve" }); });
  it("szerkeszti és menti a profiladatokat", async () => {
    render(<MemoryRouter><AccountProfilePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Adatok szerkesztése" }));
    fireEvent.change(screen.getByLabelText("Megjelenítési név"), { target: { value: "Anna Kártyabarlang" } });
    fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ full_name: "Anna Kártyabarlang", username: "anna", email: "anna@example.test" }));
    expect(mocks.refreshMe).toHaveBeenCalled();
  });
  it("csak jelszóval és pontos megerősítéssel töröl", async () => {
    render(<MemoryRouter><AccountProfilePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Profil törlésének megkezdése" }));
    fireEvent.change(screen.getByLabelText("Jelenlegi jelszó"), { target: { value: "secret" } });
    fireEvent.change(screen.getByLabelText("Megerősítés: írd be, hogy FIÓK TÖRLÉSE"), { target: { value: "FIÓK TÖRLÉSE" } });
    fireEvent.click(screen.getByRole("button", { name: "Profil végleges törlése" }));
    await waitFor(() => expect(mocks.deleteProfile).toHaveBeenCalledWith("secret"));
    expect(mocks.logout).toHaveBeenCalled();
  });
});
