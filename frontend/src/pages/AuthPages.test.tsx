import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPages";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  resendVerification: vi.fn(),
}));

vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: false,
    login: mocks.login,
    logout: vi.fn(),
    refreshMe: vi.fn(),
  }),
}));

vi.mock("../api/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/auth")>();
  return { ...original, register: mocks.register, resendVerification: mocks.resendVerification };
});

describe("AuthPage", () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.register.mockReset().mockResolvedValue({ message: "Aktiváló link elküldve." });
    mocks.resendVerification.mockReset().mockResolvedValue({ message: "Új link elküldve." });
  });

  it("a teljes aukciós regisztrációs űrlapot jeleníti meg adminválasztás nélkül", () => {
    render(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>);
    expect(screen.getByLabelText("Teljes név")).toBeInTheDocument();
    expect(screen.getByLabelText(/Felhasználónév/)).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail-cím")).toBeInTheDocument();
    expect(screen.getByLabelText("Jelszó", { selector: "input" })).toBeInTheDocument();
    expect(screen.getByLabelText("Jelszó megerősítése")).toBeInTheDocument();
    expect(screen.getByText(/nem kezel fizetést vagy szállítást/i)).toBeInTheDocument();
    expect(screen.queryByText(/admin szerepkör választása/i)).not.toBeInTheDocument();
  });

  it("a megadott felhasználónévvel és kötelező elfogadásokkal regisztrál", async () => {
    render(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Teljes név"), { target: { value: "Teszt Elek" } });
    fireEvent.change(screen.getByLabelText(/Felhasználónév/), { target: { value: "teszt-elek" } });
    fireEvent.change(screen.getByLabelText("E-mail-cím"), { target: { value: "teszt@example.com" } });
    fireEvent.change(screen.getByLabelText("Jelszó", { selector: "input" }), { target: { value: "StrongPassword123!" } });
    fireEvent.change(screen.getByLabelText("Jelszó megerősítése"), { target: { value: "StrongPassword123!" } });
    fireEvent.click(screen.getByLabelText(/Elfogadom a felhasználási feltételeket/));
    fireEvent.click(screen.getByLabelText(/Elfogadom az adatkezelési tájékoztatót/));
    fireEvent.click(screen.getByRole("button", { name: "Fiók létrehozása" }));

    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({
      email: "teszt@example.com",
      username: "teszt-elek",
      full_name: "Teszt Elek",
      accepted_terms: true,
      accepted_privacy: true,
      subscribed_newsletter: false,
    })));
    expect(await screen.findByText("Aktiváló link elküldve.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aktiváló e-mail újraküldése" })).toBeInTheDocument();
  });

  it("admin szerepkörnél az adminfelületre irányít belépés után", async () => {
    mocks.login.mockResolvedValue({ id: 1, email: "admin@example.com", username: "admin", full_name: "Admin", role: "admin" });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/admin" element={<div>Admin céloldal</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail-cím"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Jelszó", { selector: "input" }), { target: { value: "AdminPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Belépés" }));
    expect(await screen.findByText("Admin céloldal")).toBeInTheDocument();
  });

  it("normál felhasználót alapértelmezetten a főoldalra irányít belépés után", async () => {
    mocks.login.mockResolvedValue({ id: 2, email: "user@example.com", username: "user", full_name: "Teszt Felhasználó", role: "user" });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/" element={<div>Főoldal céloldal</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail-cím"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Jelszó", { selector: "input" }), { target: { value: "UserPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Belépés" }));
    expect(await screen.findByText("Főoldal céloldal")).toBeInTheDocument();
  });

  it("a rövid, megadott jelszót gyengének jelzi", () => {
    render(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Jelszó", { selector: "input" }), { target: { value: "abc" } });
    expect(screen.getByText("Gyenge")).toBeInTheDocument();
    expect(screen.queryByText("Nincs megadva")).not.toBeInTheDocument();
  });

  it("Enter és Space billentyűvel is kapcsolja a jelszó láthatóságát", () => {
    render(<MemoryRouter><AuthPage mode="login" /></MemoryRouter>);
    const passwordInput = screen.getByLabelText("Jelszó", { selector: "input" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Jelszó megjelenítése" }), { key: "Enter" });
    expect(passwordInput).toHaveAttribute("type", "text");
    fireEvent.keyDown(screen.getByRole("button", { name: "Jelszó elrejtése" }), { key: " " });
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
