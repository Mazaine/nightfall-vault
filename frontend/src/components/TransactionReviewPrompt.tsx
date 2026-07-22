import { useCallback, useEffect, useRef, useState } from "react";
import { useNotifications } from "../NotificationContext";
import { createAuctionReview, getAuction } from "../api/auctions";
import { listTransactions } from "../api/transactions";
import { ReviewDialog } from "./ReviewDialog";

export function TransactionReviewPrompt() {
  const { notifications, subscribe, markRead } = useNotifications();
  const [prompt, setPrompt] = useState<{ auctionId: number; title: string; notificationId?: number } | null>(null);
  const ignored = useRef(new Set<number>());

  const openIfReviewable = useCallback(async (auctionId: number, notificationId?: number) => {
    if (!auctionId || ignored.current.has(auctionId)) return;
    const page = await listTransactions("", 100);
    const transaction = page.items.find((item) => item.auction_id === auctionId);
    if (!transaction?.can_review) return;
    const auction = await getAuction(auctionId);
    setPrompt({ auctionId, title: auction.title, notificationId });
  }, []);

  useEffect(() => {
    const pending = notifications.find((item) => !item.is_read && item.type === "transaction_completed" && item.auction_id);
    if (pending?.auction_id) void openIfReviewable(pending.auction_id, pending.id);
  }, [notifications, openIfReviewable]);

  useEffect(() => subscribe((event) => {
    if (event.type === "notification" && event.payload.type === "transaction_completed") {
      void openIfReviewable(Number(event.payload.auction_id), Number(event.payload.id));
    }
  }), [openIfReviewable, subscribe]);

  useEffect(() => {
    const listener = (event: Event) => void openIfReviewable(Number((event as CustomEvent<{ auctionId: number }>).detail.auctionId));
    window.addEventListener("nightfall:review-ready", listener);
    return () => window.removeEventListener("nightfall:review-ready", listener);
  }, [openIfReviewable]);

  if (!prompt) return null;
  const close = () => { ignored.current.add(prompt.auctionId); setPrompt(null); };
  return <ReviewDialog auctionTitle={prompt.title} onClose={close} onSubmit={async (rating, comment) => {
    await createAuctionReview(prompt.auctionId, rating, comment);
    if (prompt.notificationId) await markRead(prompt.notificationId);
    window.dispatchEvent(new CustomEvent("nightfall:review-submitted", { detail: { auctionId: prompt.auctionId } }));
    close();
  }} />;
}
