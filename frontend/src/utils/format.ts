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

export function formatMoney(value: string | number) {
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

export function formatRemainingTime(endsAt: string, status: string) {
  if (["ended", "sold", "unsold", "cancelled", "suspended"].includes(status)) {
    return "Lezárva";
  }
  const remainingMs = new Date(endsAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "Lejárt";
  }
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  return `${hours} óra ${minutes} perc`;
}
