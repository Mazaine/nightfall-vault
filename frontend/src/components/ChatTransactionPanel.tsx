import { useCallback, useEffect, useState } from "react";
import { useNotifications } from "../NotificationContext";
import { confirmTransactionCompletion, listTransactions, type AuctionTransaction } from "../api/transactions";

export function ChatTransactionPanel({ auctionId }: { auctionId: number }) {
  const { subscribe } = useNotifications();
  const [transaction, setTransaction] = useState<AuctionTransaction | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const refresh = useCallback(async () => {
    const page = await listTransactions("", 100);
    setTransaction(page.items.find((item) => item.auction_id === auctionId) ?? null);
  }, [auctionId]);

  useEffect(() => { void refresh().catch(() => setTransaction(null)); }, [refresh]);
  useEffect(() => subscribe((event) => {
    if (event.type !== "notification" || Number(event.payload.auction_id) !== auctionId) return;
    if (!["transaction_confirmation", "transaction_completed"].includes(String(event.payload.type))) return;
    void refresh();
  }), [auctionId, refresh, subscribe]);

  if (!transaction) return null;
  const completed = transaction.status !== "transaction_open";

  const confirm = async () => {
    if (!window.confirm("Csak akkor erősítsd meg, ha az adásvétel valóban megtörtént. A másik félnek is meg kell erősítenie.")) return;
    setIsConfirming(true);
    setFeedback("");
    try {
      const updated = await confirmTransactionCompletion(transaction.id);
      setTransaction(updated);
      if (updated.status === "completed" && updated.can_review) {
        window.dispatchEvent(new CustomEvent("nightfall:review-ready", { detail: { auctionId } }));
      } else {
        setFeedback("A megerősítés rögzítve. A tranzakció a másik fél megerősítésére vár.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "A megerősítés nem sikerült.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <section className="chat-transaction-panel" aria-label="Tranzakció lezárása">
      <div><strong>{completed ? "Tranzakció teljesítve" : "Tranzakció lezárása"}</strong><small>Saját megerősítés: {transaction.own_completed_at ? "kész" : "hiányzik"} · Partner: {transaction.partner_completed_at ? "kész" : "hiányzik"}</small></div>
      {transaction.can_confirm ? <button className="button button-primary" type="button" disabled={isConfirming} onClick={() => void confirm()}>{isConfirming ? "Mentés…" : "Teljesítés megerősítése"}</button> : null}
      {!transaction.can_confirm && !completed ? <span className="transaction-waiting">Várakozás a másik félre</span> : null}
      {feedback ? <p className="form-message" role="status">{feedback}</p> : null}
    </section>
  );
}
