import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from "../api/auctions";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { NotificationPreferencesPanel } from "../components/NotificationPreferencesPanel";

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await listMyNotifications());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerult betolteni az ertesiteseket.");
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markOne(id: number) {
    await markNotificationRead(id);
    await load();
  }

  async function markAll() {
    await markAllNotificationsRead();
    await load();
  }

  return (
    <>
        <div className="page-header-row">
          <div>
            <span className="eyebrow">Fiók</span>
            <h1>Értesítések</h1>
          </div>
          <button className="button button-secondary" type="button" onClick={markAll} disabled={items.length === 0}>Összes olvasott</button>
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
              {!item.is_read ? <button className="button button-ghost" type="button" onClick={() => markOne(item.id)}>Olvasott</button> : null}
            </article>
          ))}
        </div>
        <NotificationPreferencesPanel />
    </>
  );
}
