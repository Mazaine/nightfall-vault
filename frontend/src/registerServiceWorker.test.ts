import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureServiceWorkerRegistration, SERVICE_WORKER_PATH, SERVICE_WORKER_SCOPE, shouldRegisterServiceWorker } from "./registerServiceWorker";

type TestWorker = ServiceWorker & { setState: (state: ServiceWorkerState) => void };

function worker(initialState: ServiceWorkerState = "activated"): TestWorker {
  const target = new EventTarget();
  let state = initialState;
  const testWorker = Object.assign(target, {
    scriptURL: new URL("/service-worker.js", window.location.href).href,
    setState(nextState: ServiceWorkerState) { state = nextState; target.dispatchEvent(new Event("statechange")); },
  }) as TestWorker;
  Object.defineProperty(testWorker, "state", { configurable: true, get: () => state });
  return testWorker;
}

function registration(active = true, lifecycleWorker?: TestWorker): ServiceWorkerRegistration {
  const target = new EventTarget();
  return Object.assign(target, {
    scope: new URL("/", window.location.href).href,
    active: active ? lifecycleWorker ?? worker() : null,
    installing: active ? null : lifecycleWorker ?? null,
    waiting: null,
  }) as ServiceWorkerRegistration;
}

function configureContainer(existing: ServiceWorkerRegistration | undefined, registered = existing ?? registration(), registrations = existing ? [existing] : []) {
  const register = vi.fn().mockResolvedValue(registered);
  const getRegistration = vi.fn().mockResolvedValue(existing);
  const getRegistrations = vi.fn().mockResolvedValue(registrations);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { controller: null, getRegistration, getRegistrations, register, ready: Promise.resolve(registered) },
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  return { getRegistration, getRegistrations, register };
}

describe("service worker registration", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("localhost fejlesztői környezetben engedélyezi a regisztrációt", () => {
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: true, hostname: "localhost", serviceWorkerSupported: true })).toBe(true);
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: true, hostname: "127.0.0.1", serviceWorkerSupported: true })).toBe(true);
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: true, hostname: "::1", serviceWorkerSupported: true })).toBe(true);
  });

  it("productionben biztonságos originen változatlanul engedélyezi", () => {
    expect(shouldRegisterServiceWorker({ isProduction: true, isSecureContext: true, hostname: "nightfallvault.hu", serviceWorkerSupported: true })).toBe(true);
  });

  it("nem biztonságos, nem localhost origint elutasít", () => {
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: false, hostname: "192.168.1.10", serviceWorkerSupported: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ isProduction: true, isSecureContext: false, hostname: "nightfallvault.hu", serviceWorkerSupported: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: true, hostname: "localhost.evil.com", serviceWorkerSupported: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ isProduction: false, isSecureContext: true, hostname: "127.0.0.1.evil.com", serviceWorkerSupported: true })).toBe(false);
  });

  it("a meglévő gyökér-scope regisztrációt újrahasználja", async () => {
    const existing = registration();
    const browser = configureContainer(existing);
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).resolves.toBe(existing);
    expect(browser.getRegistration).toHaveBeenCalledWith(SERVICE_WORKER_SCOPE);
    expect(browser.register).not.toHaveBeenCalled();
  });

  it("párhuzamos hívások ugyanazt a regisztrációt használják", async () => {
    const existing = registration();
    const browser = configureContainer(existing);
    const [first, second] = await Promise.all([
      ensureServiceWorkerRegistration({ timeoutMs: 50 }),
      ensureServiceWorkerRegistration({ timeoutMs: 50 }),
    ]);
    expect(first).toBe(existing);
    expect(second).toBe(existing);
    expect(browser.getRegistration).toHaveBeenCalledOnce();
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

  it("activation timeouttal megszakítja a beragadt installing workert", async () => {
    vi.useFakeTimers();
    try {
      const inactive = registration(false, worker("installing"));
      configureContainer(inactive);
      const pending = ensureServiceWorkerRegistration({ timeoutMs: 25 });
      const rejected = expect(pending).rejects.toThrow(/nem aktiválódott 10 másodpercen belül/i);
      await vi.advanceTimersByTimeAsync(26);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });

  it("aktív worker nélküli ready eredménynél újratöltést kér", async () => {
    const inactive = registration(false);
    configureContainer(inactive, inactive, [inactive]);
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).rejects.toThrow(/nem tartozik települő vagy aktív worker/i);
  });

  it("installing worker aktiválódását közvetlenül követi", async () => {
    const installing = worker("installing");
    const pendingRegistration = registration(false, installing);
    const browser = configureContainer(pendingRegistration, pendingRegistration, [pendingRegistration]);
    const pending = ensureServiceWorkerRegistration({ timeoutMs: 100 });
    await vi.waitFor(() => expect(browser.getRegistrations).toHaveBeenCalledOnce());
    await Promise.resolve();
    installing.setState("activated");
    await expect(pending).resolves.toBe(pendingRegistration);
  });

  it("controller nélkül is elfogadja az aktív gyökér-scope regisztrációt", async () => {
    const existing = registration();
    configureContainer(existing);
    expect(navigator.serviceWorker.controller).toBeNull();
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).resolves.toBe(existing);
  });

  it("eltérő scope-on maradt Nightfall worker mellett nem hoz létre második regisztrációt", async () => {
    const conflicting = registration();
    Object.defineProperty(conflicting, "scope", { configurable: true, value: new URL("/app/", window.location.href).href });
    const browser = configureContainer(undefined, registration(), [conflicting]);
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).rejects.toThrow(/Eltérő hatókörű Nightfall Vault/i);
    expect(browser.register).not.toHaveBeenCalled();
  });

  it("azonos scope-on eltérő scriptet nem használ PushManagerhez", async () => {
    const foreign = worker();
    Object.defineProperty(foreign, "scriptURL", { configurable: true, value: new URL("/legacy-sw.js", window.location.href).href });
    const existing = registration(true, foreign);
    const browser = configureContainer(existing);
    await expect(ensureServiceWorkerRegistration({ timeoutMs: 50 })).rejects.toThrow(/nem a Nightfall Vault service workere/i);
    expect(browser.register).not.toHaveBeenCalled();
  });
});
