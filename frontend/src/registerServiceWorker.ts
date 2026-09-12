export const SERVICE_WORKER_PATH = "/service-worker.js";
export const SERVICE_WORKER_SCOPE = "/";
export const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;

type RegistrationEnvironment = {
  isProduction: boolean;
  isSecureContext: boolean;
  hostname: string;
  serviceWorkerSupported: boolean;
};

type RegistrationOptions = {
  timeoutMs?: number;
};

function isLocalhost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

export function shouldRegisterServiceWorker(environment: RegistrationEnvironment) {
  if (!environment.serviceWorkerSupported) return false;
  if (environment.isProduction) return environment.isSecureContext || isLocalhost(environment.hostname);
  return isLocalhost(environment.hostname) && environment.isSecureContext;
}

function currentEnvironment(): RegistrationEnvironment {
  return {
    isProduction: import.meta.env.PROD,
    isSecureContext: window.isSecureContext,
    hostname: window.location.hostname,
    serviceWorkerSupported: "serviceWorker" in navigator,
  };
}

function expectedScope() {
  return new URL(SERVICE_WORKER_SCOPE, window.location.href).href;
}

function timeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function assertExpectedScope(registration: ServiceWorkerRegistration) {
  if (registration.scope !== expectedScope()) {
    throw new Error("Eltérő hatókörű service worker van regisztrálva. Töltsd újra az oldalt, majd próbáld újra.");
  }
  return registration;
}

let setupInFlight: Promise<ServiceWorkerRegistration> | null = null;

async function setupServiceWorker(timeoutMs: number): Promise<ServiceWorkerRegistration> {
  if (!shouldRegisterServiceWorker(currentEnvironment())) {
    throw new Error("A service worker ezen az originen nem regisztrálható biztonságosan. Használj HTTPS-t vagy localhost címet.");
  }

  let registration: ServiceWorkerRegistration;
  try {
    const existing = await timeout(
      navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE),
      timeoutMs,
      "A service worker regisztrációjának ellenőrzése időtúllépés miatt megszakadt. Próbáld újra.",
    );
    registration = existing
      ? assertExpectedScope(existing)
      : assertExpectedScope(await timeout(
          navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: SERVICE_WORKER_SCOPE }),
          timeoutMs,
          "A service worker regisztrációja időtúllépés miatt megszakadt. Próbáld újra.",
        ));
  } catch (error) {
    if (error instanceof Error && (error.message.includes("időtúllépés") || error.message.includes("Eltérő hatókörű"))) throw error;
    throw new Error("A service worker regisztrációja nem sikerült. Töltsd újra az oldalt, majd próbáld újra.", { cause: error });
  }

  if (registration.active) return registration;
  try {
    const ready = await timeout(
      navigator.serviceWorker.ready,
      timeoutMs,
      "A service worker nem aktiválódott 10 másodpercen belül. Töltsd újra az oldalt, majd próbáld újra.",
    );
    if (!ready.active) {
      throw new Error("A service worker még nem aktív. Töltsd újra az oldalt, majd próbáld újra.");
    }
    return assertExpectedScope(ready);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("service worker") || error.message.includes("Eltérő hatókörű"))) throw error;
    throw new Error("A service worker aktiválása nem sikerült. Töltsd újra az oldalt, majd próbáld újra.", { cause: error });
  }
}

export async function ensureServiceWorkerRegistration(options: RegistrationOptions = {}) {
  const timeoutMs = options.timeoutMs ?? SERVICE_WORKER_READY_TIMEOUT_MS;
  if (!setupInFlight) setupInFlight = setupServiceWorker(timeoutMs);
  const pending = setupInFlight;
  try {
    return await pending;
  } finally {
    if (setupInFlight === pending) setupInFlight = null;
  }
}

export function registerServiceWorker() {
  if (!shouldRegisterServiceWorker(currentEnvironment())) return;
  const start = () => { void ensureServiceWorkerRegistration().catch(() => {
    // PWA support must never prevent the application from starting.
  }); };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
