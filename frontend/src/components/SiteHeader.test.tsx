import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { SiteHeader } from "./SiteHeader";

const state = vi.hoisted(() => ({
  auth: {
    user: null as null | { id: number; email: string; username: string; full_name: string; role: "user" | "admin" },
    isAuthenticated: false,
    isAdmin: false,
    logout: vi.fn(),
  },
}));

vi.mock("../AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("../api/auctions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/auctions")>();
  return { ...original, getUnreadNotificationCount: vi.fn().mockResolvedValue({ unread_count: 2 }) };
});

function authenticate(role: "user" | "admin" = "user") {
  state.auth.user = { id: 1, email: "test@example.invalid", username: "hosszu-felhasznalonev-a-teszteleshez", full_name: "Nagyon Hosszú Megjelenítési Név A Navbar Teszteléséhez", role };
  state.auth.isAuthenticated = true;
  state.auth.isAdmin = role === "admin";
}

describe("SiteHeader", () => {
  beforeEach(() => {
    state.auth.user = null;
    state.auth.isAuthenticated = false;
    state.auth.isAdmin = false;
    state.auth.logout.mockClear();
  });

  it("a kijelentkezett navigációt jeleníti meg", () => {
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Belépés" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Felhasználói menü" })).not.toBeInTheDocument();
  });

  it("a profilikon menüjében a profil és a Licitjeim külön cél", async () => {
    authenticate();
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Felhasználói menü" }));
    expect(screen.getByRole("menuitem", { name: "Profilbeállítások" })).toHaveAttribute("href", "/account/profile");
    expect(screen.getByRole("menuitem", { name: "Licitjeim" })).toHaveAttribute("href", "/account/bids");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Profilbeállítások" })).toHaveFocus());
  });

  it("Escape-re bezárja a dropdownot és visszaadja a fókuszt", async () => {
    authenticate();
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);
    await screen.findByRole("link", { name: "Értesítések, 2 olvasatlan" });
    const trigger = screen.getByRole("button", { name: "Felhasználói menü" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("az adminmenüt kizárólag adminnak mutatja", async () => {
    authenticate("admin");
    const { unmount } = render(<MemoryRouter><SiteHeader /></MemoryRouter>);
    await screen.findByRole("link", { name: "Értesítések, 2 olvasatlan" });
    fireEvent.click(screen.getByRole("button", { name: "Felhasználói menü" }));
    expect(screen.getByRole("menuitem", { name: "Adminfelület" })).toBeInTheDocument();
    unmount();
    authenticate("user");
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);
    await screen.findByRole("link", { name: "Értesítések, 2 olvasatlan" });
    fireEvent.click(screen.getByRole("button", { name: "Felhasználói menü" }));
    expect(screen.queryByRole("menuitem", { name: "Adminfelület" })).not.toBeInTheDocument();
  });

  it("védi a közvetlen account URL-t kijelentkezve", async () => {
    render(<MemoryRouter initialEntries={["/account/bids"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Üdvözöllek újra" })).toBeInTheDocument();
  });
});
