import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";

const mocks = vi.hoisted(() => ({ getNotificationPreferences: vi.fn(), updateNotificationPreferences: vi.fn() }));
vi.mock("../api/auth", () => ({ ...mocks }));

const categories = ["bids", "chat", "follows", "transactions", "reviews", "moderation", "system"];
const labels = ["Licitek", "Chat", "Követések", "Tranzakciók", "Értékelések", "Moderáció", "Rendszer"];
const channels = ["Alkalmazáson belül", "Böngésző", "E-mail"];

function matrix() {
  return { categories: Object.fromEntries(categories.map((category) => [category, { in_app: true, browser: false, email: false }])) };
}

describe("NotificationPreferencesPanel", () => {
  beforeEach(() => {
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") } });
    mocks.getNotificationPreferences.mockReset().mockResolvedValue(matrix());
    mocks.updateNotificationPreferences.mockReset().mockImplementation(async (payload) => payload);
  });

  it("mind a hét kategóriához mindhárom csatornakapcsolót megjeleníti", async () => {
    render(<NotificationPreferencesPanel />);
    await screen.findByText("Licitek");
    for (const category of labels) {
      for (const channel of channels) expect(screen.getByLabelText(`${category} – ${channel}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(21);
  });

  it("a kapcsoló módosítását azonnal menti és a szerverválasszal tartja meg", async () => {
    render(<NotificationPreferencesPanel />);
    const checkbox = await screen.findByLabelText("Chat – E-mail");
    fireEvent.click(checkbox);
    await waitFor(() => expect(mocks.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(mocks.updateNotificationPreferences.mock.calls[0][0].categories.chat.email).toBe(true);
    expect(await screen.findByText("Értesítési beállítások mentve.")).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });
});
