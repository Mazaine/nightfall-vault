export const UNREAD_NOTIFICATION_COUNT_CHANGED = "nightfall:unread-notification-count-changed";

export function publishUnreadNotificationCount(count: number) {
  window.dispatchEvent(new CustomEvent<number>(UNREAD_NOTIFICATION_COUNT_CHANGED, {
    detail: Math.max(0, count),
  }));
}
