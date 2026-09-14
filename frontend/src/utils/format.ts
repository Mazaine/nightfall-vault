import type { AuctionStatus } from "../api/auctions";

const AUCTION_STATUS_LABELS: Record<AuctionStatus, string> = {
  draft: "Piszkozat",
  scheduled: "Hamarosan indul",
  active: "Aktív",
  ended: "Lezárult",
  sold: "Eladott",
  unsold: "Eladatlan",
  cancelled: "Megszakítva",
  suspended: "Felfüggesztve",
};

export function formatAuctionStatus(status: AuctionStatus) {
  return AUCTION_STATUS_LABELS[status];
}

export function formatHuf(amount: number) {
  return `${amount.toLocaleString("hu-HU")},00 Ft`;
}

export function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) {
    return "0 Ft";
  }
  return `${amount.toLocaleString("hu-HU", { maximumFractionDigits: 0 })} Ft`;
}

export function formatLocalDateTime(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatAuctionEndDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRemainingTime(endsAt: string, status: string) {
  if (["ended", "sold", "unsold", "cancelled", "suspended"].includes(status)) {
    return "Lezárva";
  }
  const remainingMs = new Date(endsAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "Lejárt";
  }
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} nap`);
  if (hours) parts.push(`${hours} óra`);
  if (minutes || parts.length === 0) parts.push(`${minutes} perc`);
  return parts.join(" ");
}
