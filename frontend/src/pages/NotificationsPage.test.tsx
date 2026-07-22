import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../components/SiteHeader";
import { NotificationsPage } from "./NotificationsPage";

const mocks = vi.hoisted(() => ({
  listMyNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
}));

vi.mock("../api/auctions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auctions")>()),
  ...mocks,
}));

vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, email: "user@example.invalid", username: "user", full_name: "Teszt Elek", role: "user" },
    isAuthenticated: true,
    isAdmin: false,
    logout: vi.fn(),
  }),
}));

vi.mock("../components/NotificationPreferencesPanel", () => ({
  NotificationPreferencesPanel: () => null,
}));

const notifications = [
  { id: 1, auction_id: 10, type: "bid", title: "Első értesítés", message: "Első üzenet", is_read: false, created_at: "2026-07-15T10:00:00Z" },
  { id: 2, auction_id: null, type: "system", title: "Második értesítés", message: "Második üzenet", is_read: false, created_at: "2026-07-15T11:00:00Z" },
];

function renderNotifications() {
  render(
    <MemoryRouter>
      <SiteHeader />
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.listMyNotifications.mockResolvedValue(notifications);
    mocks.getUnreadNotificationCount.mockResolvedValue({ unread_count: 2 });
    mocks.markNotificationRead.mockResolvedValue({ ...notifications[0], is_read: true });
    mocks.markAllNotificationsRead.mockResolvedValue({ updated: 2 });
  });

  it("azonnal olvasottra állítja a sort és frissíti a fejléc számlálóját", async () => {
    renderNotifications();
    expect(await screen.findByRole("link", { name: "Értesítések, 2 olvasatlan" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Olvasott" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Olvasott" })[0]);

    expect(screen.getAllByRole("button", { name: "Olvasott" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Értesítések, 1 olvasatlan" })).toBeInTheDocument();
    expect(mocks.listMyNotifications).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.markNotificationRead).toHaveBeenCalledWith(1));
  });

  it("az összes értesítést és a számlálót is azonnal olvasottra állítja", async () => {
    renderNotifications();
    await screen.findByRole("link", { name: "Értesítések, 2 olvasatlan" });

    fireEvent.click(screen.getByRole("button", { name: "Összes olvasott" }));

    expect(screen.queryByRole("button", { name: "Olvasott" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Értesítések" })).toBeInTheDocument();
    expect(mocks.listMyNotifications).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.markAllNotificationsRead).toHaveBeenCalledTimes(1));
  });

  it("a korábban eltárolt moderációs típuskódot is magyarul jeleníti meg", async () => {
    mocks.listMyNotifications.mockResolvedValue([
      { id: 3, auction_id: null, type: "moderation_action", category: "moderation", title: "Moderációs intézkedés", message: "auction_creation_ban: dvdv", is_read: false, created_at: "2026-07-22T10:00:00Z" },
    ]);

    renderNotifications();

    expect(await screen.findByText("Aukció-létrehozási tiltás: dvdv")).toBeInTheDocument();
    expect(screen.queryByText("auction_creation_ban: dvdv")).not.toBeInTheDocument();
  });
});
