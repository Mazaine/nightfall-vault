import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureServiceWorkerRegistration, SERVICE_WORKER_PATH, SERVICE_WORKER_SCOPE, shouldRegisterServiceWorker } from "./registerServiceWorker";

function registration(active = true): ServiceWorkerRegistration {
  return {
    scope: new URL("/", window.location.href).href,
    active: active ? {} as ServiceWorker : null,
    installing: null,
    waiting: null,
  } as ServiceWorkerRegistration;
}

function configureContainer(existing: ServiceWorkerRegistration | undefined, ready = existing ?? registration()) {
  const register = vi.fn().mockResolvedValue(ready);
  const getRegistration = vi.fn().mockResolvedValue(existing);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, register, ready: Promise.resolve(ready) },
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  return { getRegistration, register };
}

describe("service worker registration", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("localhost fejlesztői környezetben engedélyezi a regisztrációt", () => {
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: true, hostname: "localhost", serviceWorkerSupported: true })).toBe(true);
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: true, hostname: "127.0.0.1", serviceWorkerSupported: true })).toBe(true);
  });

  it("productionben biztonságos originen változatlanul engedélyezi", () => {
    expect(shouldRegisterServiceWorker({ isProduction: true, isSecureContext: true, hostname: "nightfallvault.hu", serviceWorkerSupported: true })).toBe(true);
  });

  it("nem biztonságos, nem localhost origint elutasít", () => {
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: false, hostname: "192.168.1.10", serviceWorkerSupported: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ isProduction: true, isSecureContext: false, hostname: "nightfallvault.hu", serviceWorkerSupported: true })).toBe(false);
  });

  it("a meglévő gyökér-scope regisztrációt újrahasználja", async () => {
    const existing = registration();
    const browser = configureContainer(existing);
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).resolves.toBe(existing);
    expect(browser.getRegistration).toHaveBeenCalledWith(SERVICE_WORKER_SCOPE);
    expect(browser.register).not.toHaveBeenCalled();
  });

  it("ugyanazt a service worker fájlt és scope-ot regisztrálja, ha még nincs", async () => {
    const active = registration();
    const browser = configureContainer(undefined, active);
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).resolves.toBe(active);
    expect(browser.register).toHaveBeenCalledWith(SERVICE_WORKER_PATH, { scope: SERVICE_WORKER_SCOPE });
  });

  it("érthető hibát ad regisztrációs hiba esetén", async () => {
    const browser = configureContainer(undefined);
    browser.register.mockRejectedValue(new DOMException("registration failed"));
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).rejects.toThrow(/regisztrációja nem sikerült/i);
  });

  it("időtúllépéssel megszakítja a korlátlan ready várakozást", async () => {
    vi.useFakeTimers();
    try {
      const inactive = registration(false);
      configureContainer(inactive);
      Object.defineProperty(navigator.serviceWorker, "ready", { configurable: true, value: new Promise(() => undefined) });
      const pending = ensureServiceWorkerRegistration({ timeoutMs: 25 });
      await vi.advanceTimersByTimeAsync(26);
      await expect(pending).rejects.toThrow(/nem aktiválódott 10 másodpercen belül/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
