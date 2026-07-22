import { useEffect, useMemo, useState } from "react";
import { formatRemainingTime } from "../utils/format";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const CLOSED_STATUSES = ["ended", "sold", "unsold", "cancelled", "suspended"];

type AuctionCountdownProps = {
  endsAt: string;
  status: string;
  fiveMinuteRuleEnabled?: boolean;
  className?: string;
  fallback?: string;
};

export function AuctionCountdown({ endsAt, status, fiveMinuteRuleEnabled = false, className = "", fallback }: AuctionCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const originalEndTime = useMemo(() => new Date(endsAt).getTime(), [endsAt]);
  const effectiveEndTime = originalEndTime + (fiveMinuteRuleEnabled ? FIVE_MINUTES_MS : 0);
  const remainingMs = effectiveEndTime - now;
  const isClosed = CLOSED_STATUSES.includes(status);
  const isUrgent = status === "active" && fiveMinuteRuleEnabled && now >= originalEndTime && remainingMs > 0;

  useEffect(() => {
    if (isClosed || !Number.isFinite(effectiveEndTime) || remainingMs <= 0) return;
    const untilUrgent = originalEndTime - now;
    const delay = isUrgent
      ? Math.max(100, 1000 - (Date.now() % 1000))
      : Math.max(100, Math.min(60_000, untilUrgent > 0 ? untilUrgent : 60_000));
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [effectiveEndTime, isClosed, isUrgent, now, originalEndTime, remainingMs]);

  const regularText = remainingMs <= 0 ? "Lejárt" : fallback ?? formatRemainingTime(endsAt, status);
  if (!isUrgent) {
    return <time className={`auction-countdown ${className}`.trim()} dateTime={endsAt}>{regularText}</time>;
  }

  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return (
    <time
      className={`auction-countdown auction-countdown-urgent ${className}`.trim()}
      dateTime={new Date(effectiveEndTime).toISOString()}
      role="timer"
      aria-label={`Az aukció meghosszabbított szakaszából ${minutes} perc ${seconds} másodperc van hátra.`}
    >
      <span>+5 perc hosszabbítás</span>
      <strong>{clock}</strong>
    </time>
  );
}
