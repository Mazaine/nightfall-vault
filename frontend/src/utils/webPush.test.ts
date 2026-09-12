import { beforeEach, describe, expect, it, vi } from "vitest";
import { disableWebPush, enableWebPush, getWebPushSupport, isInstalledAppDisplayMode, urlBase64ToUint8Array } from "./webPush";

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
  const active = Object.assign(new EventTarget(), {
    scriptURL: new URL("/service-worker.js", window.location.href).href,
    state: "activated",
  }) as ServiceWorker;
  const registration = { scope: new URL("/", window.location.href).href, active, pushManager } as unknown as ServiceWorkerRegistration;
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") } });
  const serviceWorker = { ready: Promise.resolve(registration), getRegistration: vi.fn().mockResolvedValue(registration), register: vi.fn() };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  return { registration, subscribe, pushManager, serviceWorker };
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

  it("default engedélyből megtagadás után nem iratkozik fel", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    const browser = configureBrowser();
    Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default", requestPermission } });
    await expect(enableWebPush()).rejects.toThrow(/engedély szükséges/i);
    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(api.getWebPushPublicKey).not.toHaveBeenCalled();
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
    expect(api.registerWebPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: expect.stringMatching(/^https:/), keys: { p256dh: "A".repeat(44), auth: "B".repeat(22) } }),
      expect.any(AbortSignal),
    );
  });

  it("a meglévő subscriptiont új subscribe nélkül frissíti", async () => {
    const existing = subscription();
    const browser = configureBrowser(existing);
    await expect(enableWebPush()).resolves.toEqual({ alreadySubscribed: true });
    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(api.registerWebPushSubscription).toHaveBeenCalledOnce();
  });

  it("public key API hibánál nem indít PushManager subscriptiont vagy backend POST-ot", async () => {
    const browser = configureBrowser();
    api.getWebPushPublicKey.mockRejectedValue(new Error("A publikus kulcs nem érhető el."));
    await expect(enableWebPush()).rejects.toThrow("A publikus kulcs nem érhető el.");
    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(api.registerWebPushSubscription).not.toHaveBeenCalled();
  });

  it("továbbadja a backend regisztrációs hibáját", async () => {
    api.registerWebPushSubscription.mockRejectedValue(new Error("Nincs hálózat."));
    await expect(enableWebPush()).rejects.toThrow("Nincs hálózat.");
  });

  it("service worker regisztrációs hibánál nem küld subscriptiont a backendnek", async () => {
    const browser = configureBrowser();
    browser.serviceWorker.getRegistration.mockRejectedValue(new DOMException("registration failed"));
    await expect(enableWebPush()).rejects.toThrow(/service worker regisztrációja nem sikerült/i);
    expect(api.registerWebPushSubscription).not.toHaveBeenCalled();
  });

  it("service worker timeout után nem kér kulcsot és nem küld subscriptiont a backendnek", async () => {
    vi.useFakeTimers();
    try {
      const browser = configureBrowser();
      browser.serviceWorker.getRegistration.mockImplementation(() => new Promise(() => undefined));
      const pending = enableWebPush({ timeoutMs: 25 });
      const rejected = expect(pending).rejects.toThrow(/ellenőrzése időtúllépés/i);
      await vi.advanceTimersByTimeAsync(26);
      await rejected;
      expect(api.getWebPushPublicKey).not.toHaveBeenCalled();
      expect(api.registerWebPushSubscription).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("érthető hibát jelez, ha a böngésző push szolgáltatása nem iratkozik fel", async () => {
    const browser = configureBrowser();
    browser.subscribe.mockRejectedValue(new DOMException("network"));
    await expect(enableWebPush()).rejects.toThrow(/böngésző push szolgáltatása/i);
    expect(api.registerWebPushSubscription).not.toHaveBeenCalled();
  });

  it("subscribe timeout után nem küld adatot a backendnek", async () => {
    vi.useFakeTimers();
    try {
      const browser = configureBrowser();
      browser.subscribe.mockImplementation(() => new Promise(() => undefined));
      const pending = enableWebPush({ timeoutMs: 25 });
      const rejected = expect(pending).rejects.toThrow(/létrehozása időtúllépés/i);
      await vi.advanceTimersByTimeAsync(26);
      await rejected;
      expect(api.registerWebPushSubscription).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sikertelen első kísérlet után újrapróbálható", async () => {
    const browser = configureBrowser();
    browser.serviceWorker.getRegistration.mockRejectedValueOnce(new DOMException("registration failed")).mockResolvedValue(browser.registration);
    await expect(enableWebPush({ timeoutMs: 50 })).rejects.toThrow(/regisztrációja nem sikerült/i);
    await expect(enableWebPush({ timeoutMs: 50 })).resolves.toEqual({ alreadySubscribed: false });
    expect(api.registerWebPushSubscription).toHaveBeenCalledOnce();
  });

  it("sikeresen visszavonja a szerveres és böngészőoldali subscriptiont", async () => {
    const existing = subscription();
    configureBrowser(existing);
    await expect(disableWebPush()).resolves.toBeUndefined();
    expect(api.revokeWebPushSubscription).toHaveBeenCalledWith(existing.endpoint, expect.any(AbortSignal));
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

  it("felismeri a telepített alkalmazás megjelenítési módját", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: true }) });
    expect(isInstalledAppDisplayMode()).toBe(true);
  });
});
