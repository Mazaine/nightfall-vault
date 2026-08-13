import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { listMyNotifications, type NotificationItem } from "../api/auctions";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { NotificationPreferencesPanel } from "../components/NotificationPreferencesPanel";
import { useNotifications } from "../NotificationContext";
import { isBidConfirmationDisabled, resetBidConfirmation } from "../utils/bidConfirmation";
import { localizeModerationMessage } from "../utils/moderationFormat";

function unreadCount(items: NotificationItem[]) {
  return items.filter((item) => !item.is_read).length;
}

export function NotificationsPage() {
  const { notifications: allNotifications, unreadCount: totalUnreadCount, markRead, markAllRead, markCategoryRead, showToast } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingNotificationId, setPendingNotificationId] = useState<number | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [bidConfirmationDisabled, setBidConfirmationDisabled] = useState(() => isBidConfirmationDisabled());
  const [bidConfirmationMessage, setBidConfirmationMessage] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const notifications = await listMyNotifications(category);
      setItems(notifications);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült betölteni az értesítéseket.");
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const receive = (event: Event) => {
      const item = (event as CustomEvent<NotificationItem>).detail;
      if (category !== "all" && item.category !== category) return;
      setItems((items) => items.some((existing) => existing.id === item.id) ? items : [item, ...items]);
    };
    window.addEventListener("nightfall:notification-received", receive);
    return () => window.removeEventListener("nightfall:notification-received", receive);
  }, [category]);

  async function markOne(id: number) {
    if (pendingNotificationId !== null || isMarkingAll) return;
    const previousItems = items;
    const notification = previousItems.find((item) => item.id === id);
    if (!notification || notification.is_read) return;

    const nextItems = previousItems.map((item) => item.id === id ? { ...item, is_read: true } : item);
    setPendingNotificationId(id);
    setError("");
    setItems(nextItems);

    try {
      await markRead(id);
    } catch (err) {
      setItems(previousItems);
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

    try {
      await markAllRead();
    } catch (err) {
      setItems(previousItems);
      setError(err instanceof Error ? err.message : "Az értesítéseket nem sikerült olvasottnak jelölni.");
    } finally {
      setIsMarkingAll(false);
    }
  }

  async function openCategory(nextCategory: string) {
    if (nextCategory === category || pendingCategory !== null) return;
    setError("");
    if (nextCategory !== "all") {
      setPendingCategory(nextCategory);
      try {
        await markCategoryRead(nextCategory);
      } catch (err) {
        setError(err instanceof Error ? err.message : "A kategória értesítéseit nem sikerült olvasottnak jelölni.");
        setPendingCategory(null);
        return;
      }
      setPendingCategory(null);
    }
    setCategory(nextCategory);
  }

  const unreadByCategory = allNotifications.reduce<Record<string, number>>((counts, item) => {
    if (!item.is_read) counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});

  const hasPendingAction = pendingNotificationId !== null || isMarkingAll || pendingCategory !== null;
  const hasUnreadNotifications = totalUnreadCount > 0;

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
      <div className="notification-filters" role="group" aria-label="Értesítési előzmények szűrése">
        {[["all", "Összes"], ["bids", "Licitek"], ["chat", "Chat"], ["follows", "Követések"], ["transactions", "Tranzakciók"], ["moderation", "Moderáció"], ["system", "Rendszer"]].map(([value, label]) => {
          const count = value === "all" ? totalUnreadCount : unreadByCategory[value] ?? 0;
          return <button className={category === value ? "filter-chip is-active" : "filter-chip"} type="button" aria-pressed={category === value} disabled={pendingCategory !== null} onClick={() => void openCategory(value)} key={value}>
            <span>{label}</span>
            {count > 0 ? <strong className="notification-filter-count" aria-label={`${count} olvasatlan`}>{count > 99 ? "99+" : count}</strong> : null}
          </button>;
        })}
      </div>
      {isLoading ? <LoadingState label="Értesítések betöltése" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      <div className="notification-list">
        {!isLoading && !error && items.length === 0 ? <EmptyState title="Nincs megjeleníthető értesítés" /> : null}
        {items.map((item) => (
          <article className={`notification-row${item.is_read ? "" : " is-unread"}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              {item.is_demo ? <span className="demo-auction-badge">TESZT AUKCIÓ</span> : null}
              <p>{localizeModerationMessage(item.message)}</p>
              {item.target_url || item.auction_id ? <Link to={item.target_url || `/auctions/${item.auction_id}`}>Megnyitás</Link> : null}
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
      <section className="side-panel profile-settings-card" aria-labelledby="notification-bid-confirmation-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Licitálás</p>
            <h2 id="notification-bid-confirmation-title">Licitmegerősítés</h2>
          </div>
          <span className={`status-badge${bidConfirmationDisabled ? "" : " is-success"}`}>
            {bidConfirmationDisabled ? "Kikapcsolva" : "Bekapcsolva"}
          </span>
        </div>
        <p>A normál „Licitálok” művelet előtt megjelenő megerősítő ablak ezen az eszközön kapcsolható vissza. A villámvásárlás mindig külön megerősítést kér.</p>
        <button
          className="button button-secondary"
          type="button"
          disabled={!bidConfirmationDisabled}
          onClick={() => {
            resetBidConfirmation();
            setBidConfirmationDisabled(false);
            const successMessage = "A licitálás előtti megerősítő ablakot visszakapcsoltad ezen az eszközön.";
            setBidConfirmationMessage(successMessage);
            showToast({ title: "Licitmegerősítés bekapcsolva", message: successMessage, targetUrl: "/account/notifications" });
          }}
        >
          {bidConfirmationDisabled ? "Megerősítés visszakapcsolása" : "A megerősítés be van kapcsolva"}
        </button>
        {bidConfirmationMessage ? <p className="form-message" role="status">{bidConfirmationMessage}</p> : null}
      </section>
    </>
  );
}
