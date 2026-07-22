import { describe, expect, it } from "vitest";
import { isInAppNotificationEnabled } from "./NotificationContext";

describe("isInAppNotificationEnabled", () => {
  it("a kikapcsolt in-app csatornát elutasítja", () => {
    expect(isInAppNotificationEnabled({ in_app_enabled: false })).toBe(false);
  });

  it("az engedélyezett in-app csatornát elfogadja", () => {
    expect(isInAppNotificationEnabled({ in_app_enabled: true })).toBe(true);
  });
});
