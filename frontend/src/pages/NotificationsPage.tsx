import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from "../api/auctions";

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(await listMyNotifications());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerult betolteni az ertesiteseket.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function markOne(id: number) {
    await markNotificationRead(id);
    await load();
  }

  async function markAll() {
    await markAllNotificationsRead();
    await load();
  }

  return (
    <section className="page-section">
      <div className="container">
        <div className="page-header-row">
          <div>
            <span className="eyebrow">Fiok</span>
            <h1>Ertesitesek</h1>
          </div>
          <button className="button button-secondary" type="button" onClick={markAll}>Osszes olvasott</button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="notification-list">
          {items.length === 0 ? <p className="empty-state">Nincs megjelenitheto ertesites.</p> : null}
          {items.map((item) => (
            <article className={`notification-row${item.is_read ? "" : " is-unread"}`} key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                {item.auction_id ? <Link to={`/auctions/${item.auction_id}`}>Aukcio megnyitasa</Link> : null}
              </div>
              {!item.is_read ? <button className="button button-ghost" type="button" onClick={() => markOne(item.id)}>Olvasott</button> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
