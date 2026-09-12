import { getWebPushPublicKey, getWebPushSubscriptionStatus, registerWebPushSubscription, revokeWebPushSubscription, type WebPushSubscriptionPayload } from "../api/auth";
import { ensureServiceWorkerRegistration } from "../registerServiceWorker";

export type WebPushSupport = { supported: boolean; reason?: string };
export const WEB_PUSH_STATE_EVENT = "nightfall:web-push-state";
export const WEB_PUSH_STATE_CHANNEL = "nightfall-web-push-state";

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

export async function getLocalWebPushSubscription(): Promise<PushSubscription | null> {
  const support = getWebPushSupport();
  if (!support.supported) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function isWebPushActiveForCurrentUser(): Promise<boolean> {
  const subscription = await getLocalWebPushSubscription();
  if (!subscription) return false;
  return (await getWebPushSubscriptionStatus(subscription.endpoint)).active;
}

export function announceWebPushState(active: boolean): void {
  window.dispatchEvent(new CustomEvent(WEB_PUSH_STATE_EVENT, { detail: { active } }));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(WEB_PUSH_STATE_CHANNEL);
    channel.postMessage({ active });
    channel.close();
  }
}

export async function enableWebPush(): Promise<{ alreadySubscribed: boolean }> {
  assertSupported();
  let permission = window.Notification.permission;
  if (permission === "default") permission = await window.Notification.requestPermission();
  if (permission !== "granted") throw new Error("A telefonos push értesítésekhez engedély szükséges a böngészőben.");

  const configuration = await getWebPushPublicKey();
  if (!configuration.enabled || !configuration.public_key) throw new Error("A telefonos push feliratkozás jelenleg nincs engedélyezve.");
  const registration = await ensureServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const alreadySubscribed = subscription !== null;
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(configuration.public_key),
      });
    } catch {
      if (!navigator.onLine) throw new Error("Nincs hálózati kapcsolat. A push feliratkozást online állapotban próbáld újra.");
      throw new Error("A böngésző push szolgáltatása nem tudta létrehozni a feliratkozást. Próbáld újra később.");
    }
  }
  await registerWebPushSubscription(serializeSubscription(subscription));
  return { alreadySubscribed };
}

export async function disableWebPush(): Promise<void> {
  assertSupported();
  const subscription = await getLocalWebPushSubscription();
  if (!subscription) return;
  await revokeWebPushSubscription(subscription.endpoint);
  let removed = false;
  try {
    removed = await subscription.unsubscribe();
  } catch {
    throw new Error("A szerveres feliratkozás visszavonva, de a böngésző helyi feliratkozását nem sikerült törölni. Próbáld újra.");
  }
  if (!removed) throw new Error("A szerveres feliratkozás visszavonva, de a böngésző helyi feliratkozását nem sikerült törölni. Próbáld újra.");
}
