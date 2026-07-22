import { useEffect, useState } from "react";
import { deleteAdminAuction, listAdminAuctions, restoreAdminAuction, suspendAdminAuction, type Auction } from "../../api/auctions";
import { formatAuctionStatus } from "../../utils/format";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncStates";

export function AdminAuctionsPage() {
  const [items, setItems] = useState<Auction[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      setItems(await listAdminAuctions());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nem sikerült betölteni az aukciókat.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(auctionId: number, action: () => Promise<unknown>) {
    setPendingId(auctionId);
    try {
      await action();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A moderációs művelet nem sikerült.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="admin-page" aria-labelledby="admin-auctions-title">
      <div className="section-heading page-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 id="admin-auctions-title">Aukciók</h1>
          <p className="section-note">Aukciók felfüggesztése, visszaállítása és naplózott törlése.</p>
        </div>
      </div>
      {isLoading ? <LoadingState label="Admin aukciók betöltése" cards={2} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && items.length === 0 && !error ? <EmptyState title="Nincs megjeleníthető aukció" /> : null}
      <div className="admin-list" aria-busy={isLoading}>
        {items.map((auction) => {
          const isPending = pendingId === auction.id;
          return (
            <article className="admin-list-row" key={auction.id}>
              <div className="admin-list-copy">
                <strong>{auction.title}</strong>
                <span>{formatAuctionStatus(auction.status)}{auction.deleted_at ? " · törölve" : ""}</span>
                {auction.moderation_reason ? <small>{auction.moderation_reason}</small> : null}
              </div>
              <div className="row-actions">
                <button className="button button-ghost" type="button" disabled={isPending || auction.status === "suspended" || Boolean(auction.deleted_at)} onClick={() => void run(auction.id, () => suspendAdminAuction(auction.id, "Adminisztrátori ellenőrzés"))}>Felfüggesztés</button>
                <button className="button button-secondary" type="button" disabled={isPending || auction.status !== "suspended" || Boolean(auction.deleted_at)} onClick={() => void run(auction.id, () => restoreAdminAuction(auction.id, "Adminisztrátori visszaállítás"))}>Visszaállítás</button>
                <button className="button button-danger" type="button" disabled={isPending || Boolean(auction.deleted_at)} onClick={() => void run(auction.id, () => deleteAdminAuction(auction.id, "Adminisztrátori törlés"))}>Törlés</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
