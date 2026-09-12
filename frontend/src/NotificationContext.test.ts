import { describe, expect, it } from "vitest";
import { isInAppNotificationEnabled, shouldShowSseSystemNotification, sseSystemNotificationIsFallback } from "./NotificationContext";

describe("isInAppNotificationEnabled", () => {
  it("a kikapcsolt in-app csatornát elutasítja", () => {
    expect(isInAppNotificationEnabled({ in_app_enabled: false })).toBe(false);
  });

  it("az engedélyezett in-app csatornát elfogadja", () => {
    expect(isInAppNotificationEnabled({ in_app_enabled: true })).toBe(true);
  });
});

describe("SSE rendszerértesítés deduplikáció", () => {
  it("aktív Web Push esetén nem használja a helyi rendszerértesítést", () => {
    expect(sseSystemNotificationIsFallback(true, true)).toBe(false);
    expect(sseSystemNotificationIsFallback(false, true)).toBe(true);
    expect(sseSystemNotificationIsFallback(true, false)).toBe(true);
  });

  it("több fül ugyanazt a notification ID-t csak egyszer foglalhatja le", () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); },
    };
    expect(shouldShowSseSystemNotification(42, storage, 100_000)).toBe(true);
    expect(shouldShowSseSystemNotification(42, storage, 100_001)).toBe(false);
    expect(shouldShowSseSystemNotification(43, storage, 100_001)).toBe(true);
  });
});
