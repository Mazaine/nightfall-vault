import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { API_BASE_URL, getStoredToken } from "./api/client";
import { deleteReadNotifications, getUnreadNotificationCount, listMyNotifications, markAllNotificationsRead, markNotificationCategoryRead, markNotificationRead, type NotificationItem } from "./api/auctions";
import { useAuth } from "./AuthContext";
import { localizeModerationMessage } from "./utils/moderationFormat";
import { isWebPushActiveForCurrentUser, WEB_PUSH_STATE_CHANNEL, WEB_PUSH_STATE_EVENT } from "./utils/webPush";

export type RealtimeEvent = { id: string; type: string; payload: Record<string, unknown> };
type Listener = (event: RealtimeEvent) => void;
type Toast = { id: string; title: string; message: string; targetUrl: string };
type ToastInput = Omit<Toast, "id">;

type NotificationContextValue = {
  isRealtimeReady: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  reload: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  markCategoryRead: (category: string) => Promise<void>;
  deleteRead: () => Promise<{ deleted: number; retained: number }>;
  subscribe: (listener: Listener) => () => void;
  showToast: (toast: ToastInput) => void;
};

const EMPTY_CONTEXT: NotificationContextValue = { isRealtimeReady: false, notifications: [], unreadCount: 0, isLoading: false, reload: async () => undefined, markRead: async () => undefined, markAllRead: async () => undefined, markCategoryRead: async () => undefined, deleteRead: async () => ({ deleted: 0, retained: 0 }), subscribe: () => () => undefined, showToast: () => undefined };
const NotificationContext = createContext<NotificationContextValue>(EMPTY_CONTEXT);
const LAST_EVENT_KEY = "nightfall:last-realtime-event";

export function isInAppNotificationEnabled(item: Pick<NotificationItem, "in_app_enabled">) {
  return item.in_app_enabled !== false;
}

export function shouldShowSseSystemNotification(notificationId: number, storage: Storage = window.localStorage, currentTime = Date.now()) {
  const key = `nightfall:sse-system-notification:${notificationId}`;
  try {
    const previous = Number(storage.getItem(key) || 0);
    if (previous > 0 && currentTime - previous < 60_000) return false;
    storage.setItem(key, String(currentTime));
    return true;
  } catch {
    return true;
  }
}

export function sseSystemNotificationIsFallback(pushEnabled: boolean | undefined, webPushActive: boolean) {
  return !(pushEnabled && webPushActive);
}

function parseEvent(block: string): RealtimeEvent | null {
  const lines = block.split("\n");
  const id = lines.find((line) => line.startsWith("id:"))?.slice(3).trim() ?? "";
  const type = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
  if (!data) return null;
  try { return { id, type, payload: JSON.parse(data) as Record<string, unknown> }; } catch { return null; }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [webPushActive, setWebPushActive] = useState(false);
  const [webPushStateReady, setWebPushStateReady] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const seenEventIds = useRef(new Set<string>());

  const showToast = useCallback((toast: ToastInput) => {
    const item = { ...toast, id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    setToasts((items) => [...items, item].slice(-4));
    window.setTimeout(() => setToasts((items) => items.filter((entry) => entry.id !== item.id)), 6500);
  }, []);

  const reload = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const [items, count] = await Promise.all([listMyNotifications(), getUnreadNotificationCount()]);
      setNotifications(items);
      setUnreadCount(count.unread_count);
    } finally { setIsLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { if (isAuthenticated) void reload(); else { setNotifications([]); setUnreadCount(0); } }, [isAuthenticated, reload]);

  useEffect(() => {
    let cancelled = false;
    setWebPushStateReady(false);
    if (!isAuthenticated) {
      setWebPushActive(false);
      setWebPushStateReady(true);
      return;
    }
    void isWebPushActiveForCurrentUser().then((active) => {
      if (!cancelled) setWebPushActive(active);
    }).catch(() => {
      if (!cancelled) setWebPushActive(false);
    }).finally(() => {
      if (!cancelled) setWebPushStateReady(true);
    });
    const update = (value: unknown) => {
      const active = Boolean((value as { active?: unknown } | null)?.active);
      setWebPushActive(active);
      setWebPushStateReady(true);
    };
    const onLocalState = (event: Event) => update((event as CustomEvent).detail);
    window.addEventListener(WEB_PUSH_STATE_EVENT, onLocalState);
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(WEB_PUSH_STATE_CHANNEL) : null;
    if (channel) channel.onmessage = (event) => update(event.data);
    return () => { cancelled = true; window.removeEventListener(WEB_PUSH_STATE_EVENT, onLocalState); channel?.close(); };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !webPushStateReady) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let retryMs = 1000;

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const headers = new Headers({ Accept: "text/event-stream" });
          const token = getStoredToken();
          if (token) headers.set("Authorization", `Bearer ${token}`);
          const eventStorageKey = `${LAST_EVENT_KEY}:${user?.id ?? "anonymous"}`;
          const lastId = sessionStorage.getItem(eventStorageKey);
          if (lastId) headers.set("Last-Event-ID", lastId);
          const response = await fetch(`${API_BASE_URL}/api/realtime/stream`, { headers, signal: controller.signal, cache: "no-store" });
          if (!response.ok || !response.body) throw new Error("A realtime kapcsolat nem érhető el.");
          retryMs = 1000;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const event = parseEvent(buffer.slice(0, boundary));
              buffer = buffer.slice(boundary + 2);
              boundary = buffer.indexOf("\n\n");
              if (!event || event.type === "heartbeat" || (event.id && seenEventIds.current.has(event.id))) continue;
              if (event.id) { seenEventIds.current.add(event.id); sessionStorage.setItem(eventStorageKey, event.id); }
              listeners.current.forEach((listener) => listener(event));
              if (event.type === "notification") {
                const item = event.payload as unknown as NotificationItem;
                const targetUrl = item.target_url || "/account/notifications";
                if (isInAppNotificationEnabled(item)) {
                  setNotifications((items) => items.some((existing) => existing.id === item.id) ? items : [item, ...items]);
                  setUnreadCount((count) => count + 1);
                  window.dispatchEvent(new CustomEvent("nightfall:notification-received", { detail: item }));
                  const localizedMessage = localizeModerationMessage(item.message);
                  const toast = { id: event.id || String(item.id), title: item.title, message: localizedMessage, targetUrl };
                  setToasts((items) => [...items.filter((entry) => entry.id !== toast.id), toast].slice(-4));
                  window.setTimeout(() => setToasts((items) => items.filter((entry) => entry.id !== toast.id)), 6500);
                }
                if (sseSystemNotificationIsFallback(item.push_enabled, webPushActive) && item.browser_enabled && typeof window.Notification !== "undefined" && window.Notification.permission === "granted" && document.visibilityState !== "visible" && shouldShowSseSystemNotification(item.id)) {
                  const browserNotification = new window.Notification(item.title, { body: localizeModerationMessage(item.message), tag: `nightfall-${item.id}` });
                  browserNotification.onclick = () => { window.focus(); navigate(targetUrl); browserNotification.close(); };
                }
              } else if (event.type === "notification_read") {
                const id = Number(event.payload.id);
                setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
                setUnreadCount((count) => Math.max(0, count - 1));
              } else if (event.type === "notifications_read_all") {
                setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
                setUnreadCount(0);
              } else if (event.type === "notifications_read_category") {
                const category = String(event.payload.category ?? "");
                setNotifications((items) => {
                  const changed = items.filter((item) => item.category === category && !item.is_read).length;
                  if (changed) setUnreadCount((count) => Math.max(0, count - changed));
                  return items.map((item) => item.category === category ? { ...item, is_read: true } : item);
                });
              } else if (event.type === "notifications_read_deleted") {
                void reload();
              }
            }
          }
        } catch (error) {
          if (stopped || (error instanceof DOMException && error.name === "AbortError")) break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, retryMs));
        retryMs = Math.min(retryMs * 2, 15000);
      }
    };
    seenEventIds.current.clear();
    void connect();
    const sendHeartbeat = () => {
      const token = getStoredToken();
      if (token) void fetch(`${API_BASE_URL}/api/realtime/heartbeat`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    };
    sendHeartbeat();
    const heartbeat = window.setInterval(() => {
      sendHeartbeat();
    }, 25000);
    return () => { stopped = true; controller?.abort(); window.clearInterval(heartbeat); };
  }, [isAuthenticated, navigate, reload, user?.id, webPushActive, webPushStateReady]);

  const markRead = useCallback(async (id: number) => {
    const existing = notifications.find((item) => item.id === id);
    if (!existing || existing.is_read) return;
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try { await markNotificationRead(id); } catch (error) { await reload(); throw error; }
  }, [notifications, reload]);

  const markAllRead = useCallback(async () => {
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
    try { await markAllNotificationsRead(); } catch (error) { await reload(); throw error; }
  }, [reload]);

  const markCategoryRead = useCallback(async (category: string) => {
    const changed = notifications.filter((item) => item.category === category && !item.is_read).length;
    if (!changed) return;
    setNotifications((items) => items.map((item) => item.category === category ? { ...item, is_read: true } : item));
    setUnreadCount((count) => Math.max(0, count - changed));
    try { await markNotificationCategoryRead(category); } catch (error) { await reload(); throw error; }
  }, [notifications, reload]);

  const deleteRead = useCallback(async () => {
    const result = await deleteReadNotifications();
    await reload();
    return result;
  }, [reload]);

  const subscribe = useCallback((listener: Listener) => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; }, []);
  const value = useMemo(() => ({ isRealtimeReady: true, notifications, unreadCount, isLoading, reload, markRead, markAllRead, markCategoryRead, deleteRead, subscribe, showToast }), [notifications, unreadCount, isLoading, reload, markRead, markAllRead, markCategoryRead, deleteRead, subscribe, showToast]);

  return <NotificationContext.Provider value={value}>{children}<div className="toast-region" aria-live="polite" aria-label="Értesítések">{toasts.map((toast) => <button className="nightfall-toast" type="button" key={toast.id} onClick={() => { navigate(toast.targetUrl); setToasts((items) => items.filter((item) => item.id !== toast.id)); }}><strong>{toast.title}</strong><span>{toast.message}</span></button>)}</div></NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
