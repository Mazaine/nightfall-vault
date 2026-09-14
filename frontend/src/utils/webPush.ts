import { getWebPushPublicKey, getWebPushSubscriptionStatus, registerWebPushSubscription, revokeWebPushSubscription, sendWebPushTest, type WebPushSubscriptionPayload } from "../api/auth";
import { ensureServiceWorkerRegistration } from "../registerServiceWorker";

export type WebPushSupport = { supported: boolean; reason?: string };
export type WebPushDeviceStatus = {
  state: "not_supported" | "permission_denied" | "unsubscribed" | "active" | "needs_resubscribe";
  active: boolean;
  lastSuccessAt: string | null;
};
export const WEB_PUSH_STATE_EVENT = "nightfall:web-push-state";
export const WEB_PUSH_STATE_CHANNEL = "nightfall-web-push-state";
export const WEB_PUSH_OPERATION_TIMEOUT_MS = 10_000;

type WebPushOptions = { timeoutMs?: number };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function withApiTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, message: string): Promise<T> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
      controller.abort();
    }, timeoutMs);
    operation(controller.signal).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

export function isInstalledAppDisplayMode(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches === true || document.referrer.startsWith("android-app://");
}

export function getWebPushSupport(): WebPushSupport {
  if (!window.isSecureContext) return { supported: false, reason: "A telefonos push csak biztonságos HTTPS-kapcsolaton használható." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof window.Notification === "undefined") {
    return { supported: false, reason: "Ez a böngésző nem támogatja a telefonos push értesítéseket." };
  }
  return { supported: true };
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function serializeSubscription(subscription: PushSubscription): WebPushSubscriptionPayload {
  const json = subscription.toJSON();
  if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("A böngésző hiányos push-feliratkozást adott vissza.");
  }
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

function assertSupported() {
  const support = getWebPushSupport();
  if (!support.supported) throw new Error(support.reason);
}

export async function getLocalWebPushSubscription(options: WebPushOptions = {}): Promise<PushSubscription | null> {
  const support = getWebPushSupport();
  if (!support.supported) return null;
  const timeoutMs = options.timeoutMs ?? WEB_PUSH_OPERATION_TIMEOUT_MS;
  const registration = await withTimeout(navigator.serviceWorker.getRegistration("/"), timeoutMs, "A service worker állapotának lekérése időtúllépés miatt megszakadt.");
  return registration
    ? withTimeout(registration.pushManager.getSubscription(), timeoutMs, "A push feliratkozás állapotának lekérése időtúllépés miatt megszakadt.")
    : null;
}

export async function isWebPushActiveForCurrentUser(options: WebPushOptions = {}): Promise<boolean> {
  return (await getWebPushDeviceStatus(options)).active;
}

export async function getWebPushDeviceStatus(options: WebPushOptions = {}): Promise<WebPushDeviceStatus> {
  const support = getWebPushSupport();
  if (!support.supported) return { state: "not_supported", active: false, lastSuccessAt: null };
  if (window.Notification.permission === "denied") return { state: "permission_denied", active: false, lastSuccessAt: null };
  const timeoutMs = options.timeoutMs ?? WEB_PUSH_OPERATION_TIMEOUT_MS;
  const subscription = await getLocalWebPushSubscription({ timeoutMs });
  if (!subscription) return { state: "unsubscribed", active: false, lastSuccessAt: null };
  const status = await withApiTimeout((signal) => getWebPushSubscriptionStatus(subscription.endpoint, signal), timeoutMs, "A push feliratkozás szerveres ellenőrzése időtúllépés miatt megszakadt.");
  return { state: status.state, active: status.active, lastSuccessAt: status.last_success_at };
}

export async function testWebPush(options: WebPushOptions = {}): Promise<{ lastSuccessAt: string }> {
  const timeoutMs = options.timeoutMs ?? WEB_PUSH_OPERATION_TIMEOUT_MS;
  const subscription = await getLocalWebPushSubscription({ timeoutMs });
  if (!subscription) throw new Error("Ezen az eszközön nincs tesztelhető push-feliratkozás.");
  const result = await withApiTimeout(
    (signal) => sendWebPushTest(subscription.endpoint, signal),
    timeoutMs,
    "A tesztértesítés küldése időtúllépés miatt megszakadt.",
  );
  return { lastSuccessAt: result.last_success_at };
}

export function announceWebPushState(active: boolean): void {
  window.dispatchEvent(new CustomEvent(WEB_PUSH_STATE_EVENT, { detail: { active } }));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(WEB_PUSH_STATE_CHANNEL);
    channel.postMessage({ active });
    channel.close();
  }
}

export async function enableWebPush(options: WebPushOptions = {}): Promise<{ alreadySubscribed: boolean }> {
  const timeoutMs = options.timeoutMs ?? WEB_PUSH_OPERATION_TIMEOUT_MS;
  assertSupported();
  let permission = window.Notification.permission;
  if (permission === "default") {
    permission = await withTimeout(window.Notification.requestPermission(), timeoutMs, "Az értesítési engedélykérés időtúllépés miatt megszakadt. Próbáld újra.");
  }
  if (permission !== "granted") throw new Error("A telefonos push értesítésekhez engedély szükséges a böngészőben.");

  const registration = await ensureServiceWorkerRegistration({ timeoutMs });
  const configuration = await withApiTimeout((signal) => getWebPushPublicKey(signal), timeoutMs, "A VAPID publikus kulcs lekérése időtúllépés miatt megszakadt. Próbáld újra.");
  if (!configuration.enabled || !configuration.public_key) throw new Error("A telefonos push feliratkozás jelenleg nincs engedélyezve.");
  let subscription = await withTimeout(registration.pushManager.getSubscription(), timeoutMs, "A meglévő push feliratkozás ellenőrzése időtúllépés miatt megszakadt. Próbáld újra.");
  const alreadySubscribed = subscription !== null;
  if (!subscription) {
    try {
      subscription = await withTimeout(registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(configuration.public_key),
      }), timeoutMs, "A push feliratkozás létrehozása időtúllépés miatt megszakadt. Próbáld újra.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("időtúllépés")) throw error;
      if (!navigator.onLine) throw new Error("Nincs hálózati kapcsolat. A push feliratkozást online állapotban próbáld újra.");
      throw new Error("A böngésző push szolgáltatása nem tudta létrehozni a feliratkozást. Próbáld újra később.");
    }
  }
  await withApiTimeout(
    (signal) => registerWebPushSubscription(serializeSubscription(subscription), signal),
    timeoutMs,
    "A push feliratkozás szerveres mentése időtúllépés miatt megszakadt. Ellenőrizd az állapotot, majd próbáld újra.",
  );
  return { alreadySubscribed };
}

export async function disableWebPush(options: WebPushOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? WEB_PUSH_OPERATION_TIMEOUT_MS;
  assertSupported();
  const subscription = await getLocalWebPushSubscription({ timeoutMs });
  if (!subscription) return;
  await withApiTimeout((signal) => revokeWebPushSubscription(subscription.endpoint, signal), timeoutMs, "A push feliratkozás szerveres visszavonása időtúllépés miatt megszakadt. Próbáld újra.");
  let removed = false;
  try {
    removed = await withTimeout(subscription.unsubscribe(), timeoutMs, "A böngésző helyi push feliratkozásának törlése időtúllépés miatt megszakadt. Próbáld újra.");
  } catch {
    throw new Error("A szerveres feliratkozás visszavonva, de a böngésző helyi feliratkozását nem sikerült törölni. Próbáld újra.");
  }
  if (!removed) throw new Error("A szerveres feliratkozás visszavonva, de a böngésző helyi feliratkozását nem sikerült törölni. Próbáld újra.");
}
