import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";

const mocks = vi.hoisted(() => ({ getNotificationPreferences: vi.fn(), updateNotificationPreferences: vi.fn() }));
const pushMocks = vi.hoisted(() => ({
  announceWebPushState: vi.fn(),
  disableWebPush: vi.fn(),
  enableWebPush: vi.fn(),
  getWebPushSupport: vi.fn(),
  isInstalledAppDisplayMode: vi.fn(),
  isWebPushActiveForCurrentUser: vi.fn(),
}));
vi.mock("../api/auth", () => ({ ...mocks }));
vi.mock("../utils/webPush", () => ({ ...pushMocks }));

const categories = ["bids", "chat", "follows", "transactions", "reviews", "moderation", "system"];
const labels = ["Licitek", "Chat", "Követések", "Tranzakciók", "Értékelések", "Moderáció", "Rendszer"];
const channels = ["Alkalmazáson belüli értesítés", "Értesítés megnyitott alkalmazásnál", "Telefonos push értesítés", "E-mail"];

function matrix() {
  return { categories: Object.fromEntries(categories.map((category) => [category, { in_app: true, browser: false, push: false, email: false }])), push_defaults_eligible: true };
}

describe("NotificationPreferencesPanel", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") } });
    mocks.getNotificationPreferences.mockReset().mockResolvedValue(matrix());
    mocks.updateNotificationPreferences.mockReset().mockImplementation(async (payload) => payload);
    pushMocks.announceWebPushState.mockReset();
    pushMocks.disableWebPush.mockReset().mockResolvedValue(undefined);
    pushMocks.enableWebPush.mockReset().mockResolvedValue({ alreadySubscribed: false });
    pushMocks.getWebPushSupport.mockReset().mockReturnValue({ supported: true });
    pushMocks.isInstalledAppDisplayMode.mockReset().mockReturnValue(false);
    pushMocks.isWebPushActiveForCurrentUser.mockReset().mockResolvedValue(false);
  });

  it("mind a hét kategóriához mind a négy csatornakapcsolót megjeleníti", async () => {
    render(<NotificationPreferencesPanel />);
    await screen.findByText("Licitek");
    for (const category of labels) {
      for (const channel of channels) expect(screen.getByLabelText(`${category} – ${channel}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(28);
    expect(screen.getByRole("heading", { name: "Telefonos push ezen az eszközön" })).toBeInTheDocument();
    expect(screen.getByText(/Android energiatakarékossága/i)).toBeInTheDocument();
  });

  it("hiba után megszünteti a folyamatjelzést és engedi az újrapróbálást", async () => {
    pushMocks.enableWebPush.mockRejectedValueOnce(new Error("A service worker nem aktiválódott 10 másodpercen belül. Töltsd újra az oldalt, majd próbáld újra.")).mockResolvedValueOnce({ alreadySubscribed: false });
    render(<NotificationPreferencesPanel />);
    const button = await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" });
    fireEvent.click(button);
    expect(await screen.findByText(/nem aktiválódott 10 másodpercen belül/i)).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByText(/feliratkozás elkészült ezen az eszközön/i)).toBeInTheDocument();
    expect(pushMocks.enableWebPush).toHaveBeenCalledTimes(2);
  });

  it("folyamat közben letiltja, siker után visszaállítja a gombot", async () => {
    let finish: ((value: { alreadySubscribed: boolean }) => void) | undefined;
    pushMocks.enableWebPush.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    const busy = await screen.findByRole("button", { name: "Folyamatban…" });
    expect(busy).toBeDisabled();
    finish?.({ alreadySubscribed: false });
    const enabled = await screen.findByRole("button", { name: "Kikapcsolás ezen az eszközön" });
    expect(enabled).toBeEnabled();
  });

  it("sikeres bekapcsolás után a következő kattintás kikapcsolja az eszközt", async () => {
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    const disable = await screen.findByRole("button", { name: "Kikapcsolás ezen az eszközön" });
    fireEvent.click(disable);
    await screen.findByText(/kikapcsolva ezen az eszközön/i);
    expect(pushMocks.disableWebPush).toHaveBeenCalledOnce();
    expect(pushMocks.announceWebPushState).toHaveBeenLastCalledWith(false);
  });

  it("telepített alkalmazásban sikeres feliratkozás után alapból bekapcsolja a push kategóriákat", async () => {
    pushMocks.isInstalledAppDisplayMode.mockReturnValue(true);
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    await waitFor(() => expect(mocks.updateNotificationPreferences).toHaveBeenCalled());
    const calls = mocks.updateNotificationPreferences.mock.calls;
    const saved = calls[calls.length - 1][0] as ReturnType<typeof matrix>;
    expect(Object.values(saved.categories).every((channels) => channels.push)).toBe(true);
    expect(pushMocks.announceWebPushState).toHaveBeenCalledWith(true);
  });

  it("korábban konfigurált mobil-PWA preferenciákat nem ír felül", async () => {
    pushMocks.isInstalledAppDisplayMode.mockReturnValue(true);
    mocks.getNotificationPreferences.mockResolvedValue({ ...matrix(), push_defaults_eligible: false });
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    await screen.findByText(/feliratkozás elkészült ezen az eszközön/i);
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("desktop böngészőben nem alkalmaz mobil-PWA alapértékeket", async () => {
    pushMocks.isInstalledAppDisplayMode.mockReturnValue(false);
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    await screen.findByText(/feliratkozás elkészült ezen az eszközön/i);
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("megtagadott rendszerengedélynél nem indít engedélyezést vagy alapérték-mentést", async () => {
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "denied", requestPermission: vi.fn() } });
    render(<NotificationPreferencesPanel />);
    const button = await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(pushMocks.enableWebPush).not.toHaveBeenCalled();
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
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
