import { useEffect, useState } from "react";
import { deleteAdminAuction, listAdminAuctions, restoreAdminAuction, suspendAdminAuction, type Auction } from "../../api/auctions";

export function AdminAuctionsPage() {
  const [items, setItems] = useState<Auction[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(await listAdminAuctions());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerult betolteni az aukciokat.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "A moderacios muvelet nem sikerult.");
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Admin</span>
          <h1>Admin aukciok</h1>
          <p>Aukciok felfuggesztese, visszaallitasa es soft delete moderacios indokkal.</p>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="admin-list">
        {items.map((auction) => (
          <article className="admin-list-row" key={auction.id}>
            <div>
              <strong>{auction.title}</strong>
              <span>{auction.status}{auction.deleted_at ? " | torolve" : ""}</span>
              {auction.moderation_reason ? <small>{auction.moderation_reason}</small> : null}
            </div>
            <div className="row-actions">
              <button className="button button-ghost" type="button" onClick={() => run(() => suspendAdminAuction(auction.id, "Admin moderation"))}>Felfuggesztes</button>
              <button className="button button-secondary" type="button" onClick={() => run(() => restoreAdminAuction(auction.id, "Admin restore"))}>Visszaallitas</button>
              <button className="button button-ghost" type="button" onClick={() => run(() => deleteAdminAuction(auction.id, "Admin soft delete"))}>Torles</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
