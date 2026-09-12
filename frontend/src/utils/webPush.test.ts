import { beforeEach, describe, expect, it, vi } from "vitest";
import { disableWebPush, enableWebPush, getWebPushSupport, urlBase64ToUint8Array } from "./webPush";

const api = vi.hoisted(() => ({
  getWebPushPublicKey: vi.fn(),
  getWebPushSubscriptionStatus: vi.fn(),
  registerWebPushSubscription: vi.fn(),
  revokeWebPushSubscription: vi.fn(),
}));
vi.mock("../api/auth", () => ({ ...api }));

function subscription(unsubscribe = vi.fn().mockResolvedValue(true)) {
  return {
    endpoint: "https://push.example.invalid/subscription/1",
    toJSON: () => ({ endpoint: "https://push.example.invalid/subscription/1", keys: { p256dh: "A".repeat(44), auth: "B".repeat(22) } }),
    unsubscribe,
  } as unknown as PushSubscription;
}

function configureBrowser(existing: PushSubscription | null = null) {
  const subscribe = vi.fn().mockResolvedValue(subscription());
  const pushManager = { getSubscription: vi.fn().mockResolvedValue(existing), subscribe };
  const registration = { scope: new URL("/", window.location.href).href, active: {} as ServiceWorker, pushManager } as unknown as ServiceWorkerRegistration;
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") } });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve(registration), getRegistration: vi.fn().mockResolvedValue(registration), register: vi.fn() } });
  return { subscribe, pushManager };
}

describe("Web Push subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getWebPushPublicKey.mockResolvedValue({ enabled: true, public_key: "AQID" });
    api.getWebPushSubscriptionStatus.mockResolvedValue({ active: true });
    api.registerWebPushSubscription.mockResolvedValue({ active: true });
    api.revokeWebPushSubscription.mockResolvedValue({ active: false });
    configureBrowser();
  });

  it("felismeri a nem támogatott környezetet és a Notification hiányát", () => {
    Object.defineProperty(window, "Notification", { configurable: true, value: undefined });
    expect(getWebPushSupport().supported).toBe(false);
  });

  it("elutasítja a megtagadott engedélyt", async () => {
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "denied", requestPermission: vi.fn() } });
    await expect(enableWebPush()).rejects.toThrow(/engedély szükséges/i);
    expect(api.registerWebPushSubscription).not.toHaveBeenCalled();
  });

  it("engedélyt kér, feliratkozik és elküldi az adatot a backendnek", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default", requestPermission } });
    const browser = configureBrowser();
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default", requestPermission } });
    await expect(enableWebPush()).resolves.toEqual({ alreadySubscribed: false });
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(browser.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) }));
    expect(api.registerWebPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: expect.stringMatching(/^https:/), keys: { p256dh: "A".repeat(44), auth: "B".repeat(22) } }));
  });

  it("a meglévő subscriptiont új subscribe nélkül frissíti", async () => {
    const existing = subscription();
    const browser = configureBrowser(existing);
    await expect(enableWebPush()).resolves.toEqual({ alreadySubscribed: true });
    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(api.registerWebPushSubscription).toHaveBeenCalledOnce();
  });

  it("továbbadja a backend regisztrációs hibáját", async () => {
    api.registerWebPushSubscription.mockRejectedValue(new Error("Nincs hálózat."));
    await expect(enableWebPush()).rejects.toThrow("Nincs hálózat.");
  });

  it("érthető hibát jelez, ha a böngésző push szolgáltatása nem iratkozik fel", async () => {
    const browser = configureBrowser();
    browser.subscribe.mockRejectedValue(new DOMException("network"));
    await expect(enableWebPush()).rejects.toThrow(/böngésző push szolgáltatása/i);
  });

  it("sikeresen visszavonja a szerveres és böngészőoldali subscriptiont", async () => {
    const existing = subscription();
    configureBrowser(existing);
    await expect(disableWebPush()).resolves.toBeUndefined();
    expect(api.revokeWebPushSubscription).toHaveBeenCalledWith(existing.endpoint);
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
  });

  it("backendhiba esetén nem iratkozik le helyben", async () => {
    const existing = subscription();
    configureBrowser(existing);
    api.revokeWebPushSubscription.mockRejectedValue(new Error("Backend hiba."));
    await expect(disableWebPush()).rejects.toThrow("Backend hiba.");
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });

  it("pontos részleges hibát jelez sikertelen böngészőoldali leiratkozásnál", async () => {
    const existing = subscription(vi.fn().mockResolvedValue(false));
    configureBrowser(existing);
    await expect(disableWebPush()).rejects.toThrow(/szerveres feliratkozás visszavonva/i);
  });

  it("URL-safe base64 VAPID-kulcsot Uint8Array formára alakít", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID-_8"))).toEqual([1, 2, 3, 251, 255]);
  });
});
