import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";

const mocks = vi.hoisted(() => ({ getNotificationPreferences: vi.fn(), updateNotificationPreferences: vi.fn() }));
const pushMocks = vi.hoisted(() => ({
  announceWebPushState: vi.fn(),
  disableWebPush: vi.fn(),
  enableWebPush: vi.fn(),
  getWebPushDeviceStatus: vi.fn(),
  getWebPushSupport: vi.fn(),
  isInstalledAppDisplayMode: vi.fn(),
  testWebPush: vi.fn(),
}));
vi.mock("../api/auth", () => ({ ...mocks }));
vi.mock("../utils/webPush", () => ({ ...pushMocks }));

const categories = ["outbid", "auction_bid_received", "auction_won", "auction_lost", "auction_sold", "auction_unsold", "watchlist_reminder", "seller_auction_reminder", "transaction_updates", "auction_message", "seller_new_auction", "review_received", "bid_updates", "moderation", "system"];
const labels = ["Rám licitáltak", "Új licit érkezett a saját aukciómra", "Megnyertem az aukciót", "Nem én nyertem az aukciót", "Sikeresen lezárult a saját aukcióm", "A saját aukcióm eladatlanul zárult", "Figyelt aukció hamarosan lejár", "Saját aukcióm hamarosan lejár", "Tranzakcióval kapcsolatos értesítés", "Új tranzakciós chatüzenet", "Követett eladó új aukciója", "Új értékelés érkezett", "Licit visszavonása vagy licitvezető-változás", "Moderációs értesítés", "Egyéb rendszerértesítés"];
const channels = ["E-mail", "Telefonos push"];

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
    pushMocks.getWebPushDeviceStatus.mockReset().mockResolvedValue({ state: "unsubscribed", active: false, lastSuccessAt: null });
    pushMocks.testWebPush.mockReset().mockResolvedValue({ lastSuccessAt: "2026-09-14T10:00:00Z" });
  });

  it("minden eseményhez külön e-mail és push kapcsolót jelenít meg", async () => {
    render(<NotificationPreferencesPanel />);
    await screen.findByText("Rám licitáltak");
    for (const category of labels) {
      for (const channel of channels) expect(screen.getByLabelText(`${category} – ${channel}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(30);
    expect(screen.getByRole("heading", { name: "Telefonos push ezen az eszközön" })).toBeInTheDocument();
    expect(screen.getByText(/Android energiatakarékossága/i)).toBeInTheDocument();
  });

  it("hiba után megszünteti a folyamatjelzést és engedi az újrapróbálást", async () => {
    pushMocks.enableWebPush.mockRejectedValueOnce(new Error("A service worker nem aktiválódott 10 másodpercen belül. Töltsd újra az oldalt, majd próbáld újra.")).mockResolvedValueOnce({ alreadySubscribed: false });
    pushMocks.getWebPushDeviceStatus.mockResolvedValueOnce({ state: "unsubscribed", active: false, lastSuccessAt: null }).mockResolvedValue({ state: "active", active: true, lastSuccessAt: null });
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
    pushMocks.getWebPushDeviceStatus.mockResolvedValueOnce({ state: "unsubscribed", active: false, lastSuccessAt: null }).mockResolvedValue({ state: "active", active: true, lastSuccessAt: null });
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    const busy = await screen.findByRole("button", { name: "Folyamatban…" });
    expect(busy).toBeDisabled();
    finish?.({ alreadySubscribed: false });
    const enabled = await screen.findByRole("button", { name: "Kikapcsolás ezen az eszközön" });
    expect(enabled).toBeEnabled();
  });

  it("sikeres bekapcsolás után a következő kattintás kikapcsolja az eszközt", async () => {
    pushMocks.getWebPushDeviceStatus.mockResolvedValueOnce({ state: "unsubscribed", active: false, lastSuccessAt: null }).mockResolvedValue({ state: "active", active: true, lastSuccessAt: null });
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
    pushMocks.getWebPushDeviceStatus.mockResolvedValueOnce({ state: "unsubscribed", active: false, lastSuccessAt: null }).mockResolvedValue({ state: "active", active: true, lastSuccessAt: null });
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
    pushMocks.getWebPushDeviceStatus.mockResolvedValueOnce({ state: "unsubscribed", active: false, lastSuccessAt: null }).mockResolvedValue({ state: "active", active: true, lastSuccessAt: null });
    mocks.getNotificationPreferences.mockResolvedValue({ ...matrix(), push_defaults_eligible: false });
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    await screen.findByText(/feliratkozás elkészült ezen az eszközön/i);
    expect(pushMocks.enableWebPush).toHaveBeenCalledOnce();
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("desktop böngészőben nem alkalmaz mobil-PWA alapértékeket", async () => {
    pushMocks.isInstalledAppDisplayMode.mockReturnValue(false);
    pushMocks.getWebPushDeviceStatus.mockResolvedValueOnce({ state: "unsubscribed", active: false, lastSuccessAt: null }).mockResolvedValue({ state: "active", active: true, lastSuccessAt: null });
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" }));
    await screen.findByText(/feliratkozás elkészült ezen az eszközön/i);
    expect(pushMocks.enableWebPush).toHaveBeenCalledOnce();
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("megtagadott rendszerengedélynél nem indít engedélyezést vagy alapérték-mentést", async () => {
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "denied", requestPermission: vi.fn() } });
    pushMocks.getWebPushDeviceStatus.mockResolvedValue({ state: "permission_denied", active: false, lastSuccessAt: null });
    render(<NotificationPreferencesPanel />);
    const button = await screen.findByRole("button", { name: "Bekapcsolás ezen az eszközön" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(pushMocks.enableWebPush).not.toHaveBeenCalled();
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("a kapcsoló módosítását azonnal menti és a szerverválasszal tartja meg", async () => {
    render(<NotificationPreferencesPanel />);
    const checkbox = await screen.findByLabelText("Új tranzakciós chatüzenet – E-mail");
    fireEvent.click(checkbox);
    await waitFor(() => expect(mocks.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(mocks.updateNotificationPreferences.mock.calls[0][0].categories.auction_message.email).toBe(true);
    expect(await screen.findByText("Értesítési beállítások mentve.")).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it("aktív saját subscriptionre tesztértesítést küld és kiírja a sikert", async () => {
    pushMocks.getWebPushDeviceStatus.mockResolvedValue({ state: "active", active: true, lastSuccessAt: null });
    render(<NotificationPreferencesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Tesztértesítés küldése erre az eszközre" }));
    expect(await screen.findByText(/sikeresen elküldtük erre az eszközre/i)).toBeInTheDocument();
    expect(pushMocks.testWebPush).toHaveBeenCalledOnce();
  });

  it("lejárt szerveres subscriptionnél újrafeliratkozási állapotot mutat", async () => {
    pushMocks.getWebPushDeviceStatus.mockResolvedValue({ state: "needs_resubscribe", active: false, lastSuccessAt: null });
    render(<NotificationPreferencesPanel />);
    expect(await screen.findByText("Hibás – újrafeliratkozás szükséges")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Újrafeliratkozás ezen az eszközön" })).toBeEnabled();
  });
});
