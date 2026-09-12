import vm from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(resolve(process.cwd(), "public/service-worker.js"), "utf8");
const validPayload = {
  schema_version: 1,
  notification_id: 42,
  event_key: "outbid:42",
  title: "Licitfrissítés",
  body: "Változás történt az egyik licitednél.",
  target_url: "/auctions/42",
  category: "bids",
  tag: "nightfall-notification-42",
  timestamp: "2026-09-12T10:00:00+00:00",
};

function loadWorker() {
  const listeners = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    location: { origin: "https://nightfallvault.hu" },
    registration: { showNotification },
    clients: { matchAll, openWindow },
    addEventListener: (name, listener) => { listeners[name] = listener; },
  };
  vm.runInNewContext(source, { self, URL, Set, Date, Number });
  return { listeners, showNotification, matchAll, openWindow };
}

async function push(worker, data) {
  let pending;
  const event = {
    data: data === null ? null : { json: () => data },
    waitUntil: (promise) => { pending = promise; },
  };
  worker.listeners.push(event);
  if (pending) await pending;
}

describe("service worker Web Push", () => {
  let worker;
  beforeEach(() => { worker = loadWorker(); });

  it("érvényes payloadból helyi ikonokkal és stabil taggel jelenít meg értesítést", async () => {
    await push(worker, validPayload);
    expect(worker.showNotification).toHaveBeenCalledWith("Licitfrissítés", expect.objectContaining({
      body: validPayload.body,
      tag: "nightfall-notification-42",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { target_url: "/auctions/42", notification_id: 42 },
    }));
  });

  it.each([
    ["hibás JSON", () => { throw new SyntaxError("bad json"); }],
    ["ismeretlen séma", () => ({ ...validPayload, schema_version: 2 })],
    ["külső URL", () => ({ ...validPayload, target_url: "https://evil.invalid" })],
    ["traversal", () => ({ ...validPayload, target_url: "/auctions/../admin" })],
    ["kódolt veszélyes URL", () => ({ ...validPayload, target_url: "/auctions/%2e%2e/admin" })],
    ["hamisított szöveg", () => ({ ...validPayload, body: "Titkos tranzakciós adat" })],
  ])("nem jelenít meg értesítést: %s", async (_name, value) => {
    let pending;
    worker.listeners.push({ data: { json: value }, waitUntil: (promise) => { pending = promise; } });
    if (pending) await pending;
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it("kattintáskor a meglévő saját origines klienst navigálja és fókuszálja", async () => {
    const client = { url: "https://nightfallvault.hu/account/profile", navigate: vi.fn().mockResolvedValue(undefined), focus: vi.fn().mockResolvedValue(undefined) };
    worker.matchAll.mockResolvedValue([client]);
    const close = vi.fn();
    let pending;
    worker.listeners.notificationclick({ notification: { data: { target_url: "/auctions/42" }, close }, waitUntil: (promise) => { pending = promise; } });
    await pending;
    expect(close).toHaveBeenCalledOnce();
    expect(client.navigate).toHaveBeenCalledWith("https://nightfallvault.hu/auctions/42");
    expect(client.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("kliens hiányában új saját origines ablakot nyit", async () => {
    let pending;
    worker.listeners.notificationclick({ notification: { data: { target_url: "/account/messages" }, close: vi.fn() }, waitUntil: (promise) => { pending = promise; } });
    await pending;
    expect(worker.openWindow).toHaveBeenCalledWith("https://nightfallvault.hu/account/messages");
  });

  it("hibás kattintási cél esetén a biztonságos értesítési oldalra lép", async () => {
    let pending;
    worker.listeners.notificationclick({ notification: { data: { target_url: "https://evil.invalid" }, close: vi.fn() }, waitUntil: (promise) => { pending = promise; } });
    await pending;
    expect(worker.openWindow).toHaveBeenCalledWith("https://nightfallvault.hu/account/notifications");
  });
});
