import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from "../api/auctions";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { NotificationPreferencesPanel } from "../components/NotificationPreferencesPanel";
import { publishUnreadNotificationCount } from "../utils/notificationEvents";

function unreadCount(items: NotificationItem[]) {
  return items.filter((item) => !item.is_read).length;
}

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingNotificationId, setPendingNotificationId] = useState<number | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const notifications = await listMyNotifications();
      setItems(notifications);
      publishUnreadNotificationCount(unreadCount(notifications));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült betölteni az értesítéseket.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markOne(id: number) {
    if (pendingNotificationId !== null || isMarkingAll) return;
    const previousItems = items;
    const notification = previousItems.find((item) => item.id === id);
    if (!notification || notification.is_read) return;

    const nextItems = previousItems.map((item) => item.id === id ? { ...item, is_read: true } : item);
    setPendingNotificationId(id);
    setError("");
    setItems(nextItems);
    publishUnreadNotificationCount(unreadCount(nextItems));

    try {
      await markNotificationRead(id);
    } catch (err) {
      setItems(previousItems);
      publishUnreadNotificationCount(unreadCount(previousItems));
      setError(err instanceof Error ? err.message : "Az értesítést nem sikerült olvasottnak jelölni.");
    } finally {
      setPendingNotificationId(null);
    }
  }

  async function markAll() {
    if (pendingNotificationId !== null || isMarkingAll || unreadCount(items) === 0) return;
    const previousItems = items;
    const nextItems = previousItems.map((item) => ({ ...item, is_read: true }));
    setIsMarkingAll(true);
    setError("");
    setItems(nextItems);
    publishUnreadNotificationCount(0);

    try {
      await markAllNotificationsRead();
    } catch (err) {
      setItems(previousItems);
      publishUnreadNotificationCount(unreadCount(previousItems));
      setError(err instanceof Error ? err.message : "Az értesítéseket nem sikerült olvasottnak jelölni.");
    } finally {
      setIsMarkingAll(false);
    }
  }

  const hasPendingAction = pendingNotificationId !== null || isMarkingAll;
  const hasUnreadNotifications = unreadCount(items) > 0;

  return (
    <>
      <div className="page-header-row">
        <div>
          <span className="eyebrow">Fiók</span>
          <h1>Értesítések</h1>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void markAll()} disabled={!hasUnreadNotifications || hasPendingAction}>
          {isMarkingAll ? "Mentés..." : "Összes olvasott"}
        </button>
      </div>
      {isLoading ? <LoadingState label="Értesítések betöltése" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      <div className="notification-list">
        {!isLoading && !error && items.length === 0 ? <EmptyState title="Nincs megjeleníthető értesítés" /> : null}
        {items.map((item) => (
          <article className={`notification-row${item.is_read ? "" : " is-unread"}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              {item.auction_id ? <Link to={`/auctions/${item.auction_id}`}>Aukció megnyitása</Link> : null}
            </div>
            {!item.is_read ? (
              <button className="button button-ghost" type="button" disabled={hasPendingAction} onClick={() => void markOne(item.id)}>
                {pendingNotificationId === item.id ? "Mentés..." : "Olvasott"}
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <NotificationPreferencesPanel />
    </>
  );
}
