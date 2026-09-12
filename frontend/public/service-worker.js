/* Nightfall Vault PWA lifecycle and validated Web Push display. */
self.addEventListener("install", () => {
  // The browser completes installation without forcing a waiting worker active.
});

self.addEventListener("activate", () => {
  // Activation intentionally leaves existing clients and network traffic untouched.
});

const PUSH_SCHEMA_VERSION = 1;
const PUSH_CATEGORIES = new Set(["bids", "chat", "follows", "transactions", "reviews", "moderation", "system"]);
const PUSH_COPY = {
  bids: ["Licitfrissítés", "Változás történt az egyik licitednél."],
  chat: ["Új üzenet", "Új üzeneted érkezett a Nightfall Vaultban."],
  follows: ["Új követési értesítés", "Új értesítés érkezett egy követett eladótól."],
  transactions: ["Tranzakciós frissítés", "Új tranzakciós értesítésed érkezett."],
  reviews: ["Új értékelési értesítés", "Új értékelési értesítésed érkezett."],
  moderation: ["Fontos fiókértesítés", "Új fiókértesítésed érkezett. Nyisd meg az alkalmazást a részletekért."],
  system: ["Nightfall Vault értesítés", "Új értesítésed érkezett."],
};
const ACCOUNT_TARGETS = new Set([
  "/account/auctions", "/account/blocked-users", "/account/messages", "/account/notifications",
  "/account/profile", "/account/reports", "/account/transactions", "/account/vip",
]);
const AUCTION_TARGET = /^\/auctions\/[1-9][0-9]*$/;
const USER_TARGET = /^\/users\/[^/?#\\]+$/;

function safeTargetUrl(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) return null;
  const lowered = value.toLowerCase();
  if (value.includes("\\") || value.startsWith("//") || lowered.startsWith("http:") || lowered.startsWith("https:")) return null;
  if (value.includes("?") || value.includes("#") || value.includes("%")) return null;
  if (value.split("/").some((segment) => segment === "." || segment === "..")) return null;
  return ACCOUNT_TARGETS.has(value) || AUCTION_TARGET.test(value) || USER_TARGET.test(value) ? value : null;
}

function validatedPushPayload(event) {
  if (!event.data) return null;
  let payload;
  try { payload = event.data.json(); } catch { return null; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.schema_version !== PUSH_SCHEMA_VERSION || !Number.isInteger(payload.notification_id) || payload.notification_id <= 0) return null;
  if (!PUSH_CATEGORIES.has(payload.category)) return null;
  if (typeof payload.event_key !== "string" || payload.event_key.length < 1 || payload.event_key.length > 220) return null;
  if (payload.tag !== `nightfall-notification-${payload.notification_id}`) return null;
  const expectedCopy = PUSH_COPY[payload.category];
  if (payload.title !== expectedCopy[0] || payload.body !== expectedCopy[1]) return null;
  const targetUrl = safeTargetUrl(payload.target_url);
  if (!targetUrl || typeof payload.timestamp !== "string" || !Number.isFinite(Date.parse(payload.timestamp))) return null;
  return { ...payload, target_url: targetUrl };
}

self.addEventListener("push", (event) => {
  const payload = validatedPushPayload(event);
  if (!payload) return;
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    renotify: false,
    data: { target_url: payload.target_url, notification_id: payload.notification_id },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTargetUrl(event.notification?.data?.target_url) || "/account/notifications";
  const absoluteTarget = new URL(target, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
    });
    if (existing) {
      if (typeof existing.navigate === "function") await existing.navigate(absoluteTarget);
      await existing.focus();
      return;
    }
    await self.clients.openWindow(absoluteTarget);
  })());
});
